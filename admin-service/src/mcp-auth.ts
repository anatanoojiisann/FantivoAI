import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Env } from "./types";

export const MCP_ANALYTICS_SCOPE = "analytics.read";

type JwtClaims = {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  exp?: unknown;
  nbf?: unknown;
  iat?: unknown;
  scope?: unknown;
  permissions?: unknown;
  azp?: unknown;
  client_id?: unknown;
};

type JwksKey = JsonWebKey & { kid?: string; kty?: string; alg?: string };
type JwksDocument = { keys?: JwksKey[] };
type McpAuthConfiguration = {
  issuer: string;
  audience: string;
  jwksUrl: string;
  resourceUrl: string;
  allowedSubjects: Set<string>;
};

const jwksCache = new Map<string, { expiresAt: number; keys: JsonWebKey[] }>();

export function mcpAuthConfiguration(env: Env): McpAuthConfiguration | null {
  const issuer = env.MCP_OAUTH_ISSUER?.trim() || "";
  const audience = env.MCP_OAUTH_AUDIENCE?.trim() || "";
  const jwksUrl = env.MCP_OAUTH_JWKS_URL?.trim() || "";
  const resourceUrl = env.MCP_RESOURCE_URL?.trim() || "";
  if (!issuer || !audience || !jwksUrl || !resourceUrl) return null;

  try {
    for (const value of [issuer, jwksUrl, resourceUrl]) {
      const url = new URL(value);
      if (url.protocol !== "https:" && !(env.ENVIRONMENT === "development" && ["localhost", "127.0.0.1"].includes(url.hostname))) return null;
    }
  } catch {
    return null;
  }

  return {
    issuer,
    audience,
    jwksUrl,
    resourceUrl: resourceUrl.replace(/\/$/, ""),
    allowedSubjects: new Set((env.MCP_ALLOWED_SUBJECTS || "").split(",").map((value) => value.trim()).filter(Boolean)),
  };
}

export function protectedResourceMetadata(env: Env) {
  const config = mcpAuthConfiguration(env);
  if (!config) return null;
  return {
    resource: config.resourceUrl,
    authorization_servers: [config.issuer],
    scopes_supported: [MCP_ANALYTICS_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Fantivo PostHog Analytics",
  };
}

export async function verifyMcpBearer(request: Request, env: Env): Promise<AuthInfo | null> {
  const config = mcpAuthConfiguration(env);
  if (!config) return null;
  const authorization = request.headers.get("Authorization") || "";
  const match = /^Bearer ([A-Za-z0-9._~-]{20,8192})$/.exec(authorization);
  if (!match) return null;

  const [encodedHeader, encodedPayload, encodedSignature, extra] = match[1].split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature || extra) return null;

  let header: { alg?: unknown; kid?: unknown };
  let claims: JwtClaims;
  try {
    header = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedHeader))) as typeof header;
    claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload))) as JwtClaims;
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !/^[A-Za-z0-9._-]{1,160}$/.test(header.kid)) return null;

  const keys = await loadJwks(config.jwksUrl);
  const jwk = keys.find((candidate) => candidate.kid === header.kid && candidate.kty === "RSA" && (!candidate.alg || candidate.alg === "RS256"));
  if (!jwk) return null;
  let validSignature = false;
  try {
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    validSignature = await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
  } catch {
    return null;
  }
  if (!validSignature) return null;

  const now = Math.floor(Date.now() / 1_000);
  const audience = typeof claims.aud === "string" ? [claims.aud] : Array.isArray(claims.aud) ? claims.aud.filter((value): value is string => typeof value === "string") : [];
  const scopes = new Set([
    ...(typeof claims.scope === "string" ? claims.scope.split(/\s+/) : []),
    ...(Array.isArray(claims.permissions) ? claims.permissions.filter((value): value is string => typeof value === "string") : []),
  ].filter(Boolean));
  const subject = typeof claims.sub === "string" ? claims.sub : "";
  if (claims.iss !== config.issuer || !audience.includes(config.audience) || !subject) return null;
  if (typeof claims.exp !== "number" || claims.exp <= now - 30) return null;
  if (typeof claims.nbf === "number" && claims.nbf > now + 30) return null;
  if (typeof claims.iat === "number" && claims.iat > now + 60) return null;
  if (!scopes.has(MCP_ANALYTICS_SCOPE)) return null;
  if (config.allowedSubjects.size && !config.allowedSubjects.has(subject)) return null;

  const clientId = typeof claims.azp === "string" ? claims.azp : typeof claims.client_id === "string" ? claims.client_id : "chatgpt";
  return {
    token: match[1],
    clientId,
    scopes: [...scopes],
    expiresAt: claims.exp,
    resource: new URL(config.resourceUrl),
    extra: { subject },
  };
}

async function loadJwks(url: string): Promise<JwksKey[]> {
  const cached = jwksCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) return [];
  const payload: JwksDocument = await response.json<JwksDocument>().catch((): JwksDocument => ({}));
  const keys = Array.isArray(payload.keys) ? payload.keys.slice(0, 20) : [];
  jwksCache.set(url, { keys, expiresAt: Date.now() + 10 * 60_000 });
  return keys;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
