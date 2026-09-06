import assert from "node:assert/strict";
import test from "node:test";
import { createSession, findTotpCounter, passwordHash, requireAdmin, totpCode, totpRequired, verifyPassword, verifySession } from "../src/auth.ts";
import { json, secureAssetResponse } from "../src/http.ts";
import { allowedSourceUrl } from "../src/media.ts";
import { createIngestSignature, verifyIngestSignature } from "../src/signature.ts";
import type { Env } from "../src/types.ts";

test("ingestion signatures cover timestamp and raw body", async () => {
  const secret = "local-test-shared-secret";
  const timestamp = "1785830400";
  const body = new TextEncoder().encode('{"eventId":"event_123"}').buffer;
  const signature = await createIngestSignature(secret, timestamp, body);
  assert.equal(await verifyIngestSignature(secret, timestamp, body, signature, 1_785_830_400_000), true);
  const changed = new TextEncoder().encode('{"eventId":"event_124"}').buffer;
  assert.equal(await verifyIngestSignature(secret, timestamp, changed, signature, 1_785_830_400_000), false);
});

test("ingestion signatures reject stale requests", async () => {
  const body = new TextEncoder().encode("{}").buffer;
  const signature = await createIngestSignature("secret", "1785830000", body);
  assert.equal(await verifyIngestSignature("secret", "1785830000", body, signature, 1_785_831_000_000), false);
});

test("administrator passwords are verified from a one-way hash", async () => {
  const hash = await passwordHash("a-random-24-character-password");
  assert.match(hash, /^sha256\$[A-Za-z0-9_-]{43}$/);
  assert.equal(await verifyPassword("a-random-24-character-password", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
});

test("TOTP follows RFC 6238 and accepts only the current time window", async () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(await totpCode(secret, 1), "287082");
  assert.equal(await findTotpCounter(secret, "287082", 59_000), 1);
  assert.equal(await findTotpCounter(secret, "287082", 180_000), null);
});

test("TOTP remains secure by default and can be disabled explicitly for internal testing", () => {
  assert.equal(totpRequired({}), true);
  assert.equal(totpRequired({ ADMIN_TOTP_REQUIRED: "true" }), true);
  assert.equal(totpRequired({ ADMIN_TOTP_REQUIRED: "false" }), false);
});

test("Admin responses enforce transport and browser security headers", async () => {
  const api = json({ ok: true });
  assert.equal(api.headers.get("Strict-Transport-Security"), "max-age=31536000");
  const asset = secureAssetResponse(new Response("<main>Admin</main>", { headers: { "Content-Type": "text/html" } }));
  assert.equal(asset.headers.get("Strict-Transport-Security"), "max-age=31536000");
  assert.equal(asset.headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(asset.headers.get("Content-Security-Policy") || "", /frame-ancestors 'none'/);
});

test("signed sessions reject tampering and protect state-changing requests with CSRF", async () => {
  const secret = "local-session-secret-that-is-at-least-32-characters";
  const now = Math.floor(Date.now() / 1_000);
  const session = await createSession("admin@example.com", secret, now);
  assert.equal((await verifySession(session.token, secret, "admin@example.com", now + 1)).sub, "admin@example.com");
  await assert.rejects(() => verifySession(`${session.token}x`, secret, "admin@example.com", now + 1));
  const env = { ENVIRONMENT: "production", ADMIN_USERNAME: "admin@example.com", ADMIN_PASSWORD_HASH: await passwordHash("password"), ADMIN_TOTP_SECRET: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", ADMIN_SESSION_SECRET: secret } as Env;
  const cookies = `aurax_admin_session=${session.token}; aurax_admin_csrf=${session.csrf}`;
  const request = new Request("https://admin.example/api/admin/v1/configuration-versions", { method: "POST", headers: { Cookie: cookies, Origin: "https://admin.example", "Sec-Fetch-Site": "same-origin", "X-CSRF-Token": session.csrf } });
  assert.equal((await requireAdmin(request, env)).username, "admin@example.com");
  await assert.rejects(() => requireAdmin(new Request(request.url, { method: "POST", headers: { Cookie: cookies, Origin: "https://evil.example", "X-CSRF-Token": session.csrf } }), env));
});

test("external media origins are allowlisted", () => {
  assert.equal(allowedSourceUrl("https://media.aurax.one/video.mp4", "media.aurax.one,images.aurax.one").hostname, "media.aurax.one");
  assert.throws(() => allowedSourceUrl("https://127.0.0.1/video.mp4", "media.aurax.one"));
});
