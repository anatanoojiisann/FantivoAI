import { json } from "./http";
import { HttpError, type Env } from "./types";

const SESSION_COOKIE = "aurax_admin_session";
const CSRF_COOKIE = "aurax_admin_csrf";
const SESSION_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const MAX_LOGIN_FAILURES = 5;

type SessionClaims = { v: 1; sub: string; csrf: string; iat: number; exp: number };
type AuthState = { failed_attempts: number; window_started_at: number; blocked_until: number; last_totp_counter: number };

export async function loginAdmin(request: Request, env: Env) {
  requireAuthConfiguration(env);
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "content_type_required", "登录请求必须使用 JSON。 ");
  }
  const input = await request.json<{ username?: unknown; password?: unknown; totp?: unknown }>();
  const username = typeof input.username === "string" ? input.username.trim() : "";
  const password = typeof input.password === "string" && input.password.length <= 256 ? input.password : "";
  const submittedTotp = typeof input.totp === "string" ? input.totp.replace(/\s/g, "") : "";
  const now = Math.floor(Date.now() / 1_000);
  await ensureAuthState(env.DB, env.ADMIN_USERNAME, now);
  const state = await authState(env.DB, env.ADMIN_USERNAME);
  if (state.blocked_until > now) throw new HttpError(429, "login_rate_limited", "登录尝试次数过多，请 15 分钟后再试。");

  const usernameValid = constantTimeTextEqual(username.toLowerCase(), env.ADMIN_USERNAME.trim().toLowerCase());
  const passwordValid = await verifyPassword(password, env.ADMIN_PASSWORD_HASH);
  const requireTotp = totpRequired(env);
  const totpCounter = requireTotp ? await findTotpCounter(env.ADMIN_TOTP_SECRET, submittedTotp, Date.now()) : null;
  if (!usernameValid || !passwordValid || (requireTotp && totpCounter === null)) {
    await recordLoginFailure(env.DB, env.ADMIN_USERNAME, state, now);
    throw new HttpError(401, "invalid_login", requireTotp ? "用户名、密码或动态验证码错误。" : "用户名或密码错误。");
  }

  if (requireTotp) {
    const consumed = await env.DB.prepare(
      "UPDATE admin_auth_state SET last_totp_counter = ?, failed_attempts = 0, window_started_at = ?, blocked_until = 0, updated_at = ? WHERE username = ? AND last_totp_counter < ?",
    ).bind(totpCounter, now, new Date(now * 1_000).toISOString(), env.ADMIN_USERNAME, totpCounter).run();
    if ((consumed.meta.changes ?? 0) !== 1) {
      await recordLoginFailure(env.DB, env.ADMIN_USERNAME, state, now);
      throw new HttpError(401, "totp_reused", "该动态验证码已使用，请等待新验证码后重试。");
    }
  } else {
    await env.DB.prepare("UPDATE admin_auth_state SET failed_attempts = 0, window_started_at = ?, blocked_until = 0, updated_at = ? WHERE username = ?")
      .bind(now, new Date(now * 1_000).toISOString(), env.ADMIN_USERNAME).run();
  }

  const session = await createSession(env.ADMIN_USERNAME, env.ADMIN_SESSION_SECRET, now);
  const headers = new Headers();
  headers.append("Set-Cookie", cookie(SESSION_COOKIE, session.token, SESSION_SECONDS, true, env.ENVIRONMENT));
  headers.append("Set-Cookie", cookie(CSRF_COOKIE, session.csrf, SESSION_SECONDS, false, env.ENVIRONMENT));
  return json({ authenticated: true, totpRequired: requireTotp, user: { username: env.ADMIN_USERNAME }, expiresAt: new Date(session.exp * 1_000).toISOString() }, 200, headers);
}

export async function adminSession(request: Request, env: Env) {
  requireAuthConfiguration(env);
  try {
    const claims = await sessionClaims(request, env);
    return json({ authenticated: true, totpRequired: totpRequired(env), user: { username: claims.sub }, expiresAt: new Date(claims.exp * 1_000).toISOString() });
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) return json({ authenticated: false, totpRequired: totpRequired(env) });
    throw error;
  }
}

export async function logoutAdmin(request: Request, env: Env) {
  if (env.ENVIRONMENT !== "development") {
    const claims = await sessionClaims(request, env);
    requireCsrf(request, claims);
  }
  const headers = new Headers();
  headers.append("Set-Cookie", cookie(SESSION_COOKIE, "", 0, true, env.ENVIRONMENT));
  headers.append("Set-Cookie", cookie(CSRF_COOKIE, "", 0, false, env.ENVIRONMENT));
  return json({ authenticated: false }, 200, headers);
}

export async function requireAdmin(request: Request, env: Env) {
  if (env.ENVIRONMENT === "development") return { username: "local-admin" };
  requireAuthConfiguration(env);
  const claims = await sessionClaims(request, env);
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) requireCsrf(request, claims);
  return { username: claims.sub };
}

export async function passwordHash(password: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return `sha256$${encodeBase64Url(new Uint8Array(bytes))}`;
}

export async function verifyPassword(password: string, expectedHash: string) {
  if (!/^sha256\$[A-Za-z0-9_-]{43}$/.test(expectedHash)) return false;
  return constantTimeTextEqual(await passwordHash(password), expectedHash);
}

export async function findTotpCounter(secret: string, submittedCode: string, nowMs = Date.now()) {
  if (!/^\d{6}$/.test(submittedCode)) return null;
  const current = Math.floor(nowMs / 30_000);
  for (const offset of [0, -1, 1]) {
    const counter = current + offset;
    if (constantTimeTextEqual(await totpCode(secret, counter), submittedCode)) return counter;
  }
  return null;
}

export async function totpCode(secret: string, counter: number, digits = 6) {
  const key = await crypto.subtle.importKey("raw", decodeBase32(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const message = new Uint8Array(8);
  new DataView(message.buffer).setBigUint64(0, BigInt(counter));
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = digest[digest.length - 1] & 0x0f;
  const value = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(value % 10 ** digits).padStart(digits, "0");
}

export async function createSession(username: string, secret: string, now = Math.floor(Date.now() / 1_000)) {
  const csrf = encodeBase64Url(crypto.getRandomValues(new Uint8Array(24)));
  const claims: SessionClaims = { v: 1, sub: username, csrf, iat: now, exp: now + SESSION_SECONDS };
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  return { token: `${payload}.${await sessionSignature(payload, secret)}`, csrf, exp: claims.exp };
}

export async function verifySession(token: string, secret: string, expectedUsername: string, now = Math.floor(Date.now() / 1_000)) {
  if (token.length > 2_048) throw unauthorized();
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !constantTimeTextEqual(await sessionSignature(payload, secret), signature)) throw unauthorized();
  let claims: SessionClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as SessionClaims;
  } catch {
    throw unauthorized();
  }
  if (claims.v !== 1 || claims.sub !== expectedUsername || !claims.csrf || claims.iat > now + 60 || claims.exp <= now || claims.exp - claims.iat !== SESSION_SECONDS) throw unauthorized();
  return claims;
}

async function sessionClaims(request: Request, env: Env) {
  const token = readCookies(request.headers.get("Cookie") || "").get(SESSION_COOKIE) || "";
  if (!token) throw unauthorized();
  return verifySession(token, env.ADMIN_SESSION_SECRET, env.ADMIN_USERNAME);
}

function requireCsrf(request: Request, claims: SessionClaims) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, "cross_origin_denied", "请求来源无效。");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) throw new HttpError(403, "cross_origin_denied", "请求来源无效。");
  const cookies = readCookies(request.headers.get("Cookie") || "");
  const header = request.headers.get("X-CSRF-Token") || "";
  if (!header || !constantTimeTextEqual(header, claims.csrf) || !constantTimeTextEqual(cookies.get(CSRF_COOKIE) || "", claims.csrf)) {
    throw new HttpError(403, "csrf_required", "登录校验已失效，请重新登录。");
  }
}

function requireAuthConfiguration(env: Env) {
  const validTotp = !totpRequired(env) || /^[A-Z2-7]{32,128}$/.test((env.ADMIN_TOTP_SECRET || "").replace(/=+$/, ""));
  if (!env.ADMIN_USERNAME?.trim() || !/^sha256\$[A-Za-z0-9_-]{43}$/.test(env.ADMIN_PASSWORD_HASH || "") || !validTotp || (env.ADMIN_SESSION_SECRET || "").length < 32) {
    throw new HttpError(503, "auth_not_configured", "后台登录尚未完成配置。");
  }
}

export function totpRequired(env: Pick<Env, "ADMIN_TOTP_REQUIRED">) {
  return env.ADMIN_TOTP_REQUIRED?.trim().toLowerCase() !== "false";
}

async function ensureAuthState(db: D1Database, username: string, now: number) {
  await db.prepare("INSERT OR IGNORE INTO admin_auth_state(username, failed_attempts, window_started_at, blocked_until, last_totp_counter, updated_at) VALUES (?, 0, ?, 0, -1, ?)")
    .bind(username, now, new Date(now * 1_000).toISOString()).run();
}

async function authState(db: D1Database, username: string) {
  return (await db.prepare("SELECT failed_attempts, window_started_at, blocked_until, last_totp_counter FROM admin_auth_state WHERE username = ?").bind(username).first<AuthState>())
    ?? { failed_attempts: 0, window_started_at: 0, blocked_until: 0, last_totp_counter: -1 };
}

async function recordLoginFailure(db: D1Database, username: string, state: AuthState, now: number) {
  const withinWindow = now - state.window_started_at < LOGIN_WINDOW_SECONDS;
  const failures = withinWindow ? state.failed_attempts + 1 : 1;
  const windowStartedAt = withinWindow ? state.window_started_at : now;
  const blockedUntil = failures >= MAX_LOGIN_FAILURES ? now + LOGIN_WINDOW_SECONDS : 0;
  await db.prepare("UPDATE admin_auth_state SET failed_attempts = ?, window_started_at = ?, blocked_until = ?, updated_at = ? WHERE username = ?")
    .bind(failures, windowStartedAt, blockedUntil, new Date(now * 1_000).toISOString(), username).run();
}

async function sessionSignature(payload: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return encodeBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
}

function cookie(name: string, value: string, maxAge: number, httpOnly: boolean, environment: Env["ENVIRONMENT"]) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Strict${httpOnly ? "; HttpOnly" : ""}${environment === "production" ? "; Secure" : ""}`;
}

function readCookies(header: string) {
  const cookies = new Map<string, string>();
  for (const item of header.split(";")) {
    const separator = item.indexOf("=");
    if (separator > 0) cookies.set(item.slice(0, separator).trim(), item.slice(separator + 1).trim());
  }
  return cookies;
}

function unauthorized() {
  return new HttpError(401, "authentication_required", "请先登录后台。");
}

function constantTimeTextEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  return difference === 0;
}

function decodeBase32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = value.toUpperCase().replace(/=+$/, "");
  if (!clean || /[^A-Z2-7]/.test(clean)) throw new HttpError(503, "auth_not_configured", "TOTP 配置无效。");
  const output: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of clean) {
    buffer = (buffer << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >>> bits) & 0xff);
    }
  }
  return new Uint8Array(output);
}

function encodeBase64Url(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
