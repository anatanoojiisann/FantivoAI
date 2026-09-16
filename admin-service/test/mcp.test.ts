import assert from "node:assert/strict";
import test, { before } from "node:test";
import { handleMcpRequest, mcpMetadataResponse } from "../src/mcp.ts";
import { verifyMcpBearer } from "../src/mcp-auth.ts";
import type { Env } from "../src/types.ts";

const mcpUrl = "http://localhost:8788/mcp";
const issuer = "http://localhost:8789/";
const jwksUrl = `${issuer}.well-known/jwks.json`;
const audience = "fantivo-posthog-chatgpt";
const resourceUrl = mcpUrl;
const subject = "fantivo-owner";

let privateKey: CryptoKey;
let publicJwk: JsonWebKey & { kid: string; alg: string; use: string };
let requestId = 0;

before(async () => {
  const keys = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  privateKey = keys.privateKey;
  publicJwk = { ...await crypto.subtle.exportKey("jwk", keys.publicKey), kid: "mcp-test-key", alg: "RS256", use: "sig" };
});

function env(overrides: Partial<Env> = {}): Env {
  return {
    ENVIRONMENT: "development",
    MCP_RESOURCE_URL: resourceUrl,
    MCP_OAUTH_ISSUER: issuer,
    MCP_OAUTH_AUDIENCE: audience,
    MCP_OAUTH_JWKS_URL: jwksUrl,
    MCP_ALLOWED_SUBJECTS: subject,
    POSTHOG_PERSONAL_API_KEY: "phx-test-secret",
    POSTHOG_PROJECT_ID: "123",
    POSTHOG_HOST: "https://us.posthog.com",
    ...overrides,
  } as Env;
}

async function jwt(overrides: Record<string, unknown> = {}, signingKey = privateKey) {
  const now = Math.floor(Date.now() / 1_000);
  const header = base64url(JSON.stringify({ alg: "RS256", kid: publicJwk.kid, typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: issuer,
    aud: audience,
    sub: subject,
    exp: now + 600,
    iat: now,
    scope: "analytics.read",
    azp: "chatgpt-test-client",
    ...overrides,
  }));
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signingKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64url(signature)}`;
}

function base64url(value: string | ArrayBuffer) {
  return Buffer.from(typeof value === "string" ? value : new Uint8Array(value)).toString("base64url");
}

async function mcp(method: string, params: Record<string, unknown>, options: { env?: Env; token?: string } = {}) {
  const headers = new Headers({
    Host: "localhost:8788",
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "MCP-Protocol-Version": "2025-06-18",
  });
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  const response = await handleMcpRequest(new Request(mcpUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
  }), options.env || env());
  return { response, payload: await response.json() as Record<string, any> };
}

function mockJwks() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(String(input), jwksUrl);
    return Response.json({ keys: [publicJwk] });
  };
  return () => { globalThis.fetch = originalFetch; };
}

test("MCP initializes and lists only the three aggregate PostHog tools without authentication", async () => {
  const initialized = await mcp("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "mcp-test", version: "1.0.0" },
  }, { env: env({ MCP_RESOURCE_URL: undefined, MCP_OAUTH_ISSUER: undefined, MCP_OAUTH_AUDIENCE: undefined, MCP_OAUTH_JWKS_URL: undefined }) });
  assert.equal(initialized.response.status, 200);
  assert.equal(initialized.payload.result.serverInfo.name, "fantivo-posthog-analytics");

  const listed = await mcp("tools/list", {}, { env: env({ MCP_RESOURCE_URL: undefined, MCP_OAUTH_ISSUER: undefined, MCP_OAUTH_AUDIENCE: undefined, MCP_OAUTH_JWKS_URL: undefined }) });
  const tools = listed.payload.result.tools;
  assert.deepEqual(tools.map((tool: any) => tool.name), [
    "get_posthog_overview",
    "get_posthog_acquisition_breakdown",
    "get_posthog_conversion_funnel",
  ]);
  assert.equal(tools.some((tool: any) => /hogql|sql/i.test(tool.name)), false);
  for (const tool of tools) {
    assert.deepEqual(tool.annotations, { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true });
    assert.deepEqual(tool.securitySchemes, [{ type: "oauth2", scopes: ["analytics.read"] }]);
    assert.deepEqual(tool._meta.securitySchemes, [{ type: "oauth2", scopes: ["analytics.read"] }]);
  }
});

test("protected-resource metadata advertises the OAuth issuer and read-only scope", () => {
  const response = mcpMetadataResponse(env());
  assert.equal(response.status, 200);
  return response.json().then((metadata: any) => {
    assert.equal(metadata.resource, resourceUrl);
    assert.deepEqual(metadata.authorization_servers, [issuer]);
    assert.deepEqual(metadata.scopes_supported, ["analytics.read"]);
  });
});

test("protected-resource metadata fails closed when OAuth is missing", async () => {
  const response = mcpMetadataResponse(env({ MCP_OAUTH_ISSUER: undefined }));
  assert.equal(response.status, 503);
  assert.match(await response.text(), /not configured/i);

  const malformed = mcpMetadataResponse(env({ MCP_OAUTH_ISSUER: "not-a-url" }));
  assert.equal(malformed.status, 503);
});

test("MCP rejects a Host header that does not match the configured resource", async () => {
  const result = await mcp("tools/list", {}, { env: env({ MCP_RESOURCE_URL: "http://localhost:9999/mcp" }) });
  assert.equal(result.response.status, 403);
  assert.match(result.payload.error.message, /Invalid Host header/);
});

test("an unauthenticated tool call returns the ChatGPT OAuth challenge without querying PostHog", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => { throw new Error("PostHog must not be called before OAuth"); };

  const result = await mcp("tools/call", {
    name: "get_posthog_acquisition_breakdown",
    arguments: { from: "2026-08-01", to: "2026-08-22", group_by: "source" },
  });
  assert.equal(result.payload.result.isError, true);
  assert.match(result.payload.result._meta["mcp/www_authenticate"][0], /oauth-protected-resource/);
  assert.match(result.payload.result._meta["mcp/www_authenticate"][0], /analytics\.read/);
});

test("a valid RS256 token lets ChatGPT read an aggregate acquisition breakdown", async (context) => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url === jwksUrl) return Response.json({ keys: [publicJwk] });
    assert.equal(url, "https://us.posthog.com/api/projects/123/query/");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer phx-test-secret");
    const body = JSON.parse(String(init?.body)) as { query: { query: string } };
    assert.match(body.query.query, /argMin/);
    assert.doesNotMatch(body.query.query, /telegram_\d+/);
    return Response.json({ results: [["telegram", 12], ["unattributed", 3]] });
  };

  const result = await mcp("tools/call", {
    name: "get_posthog_acquisition_breakdown",
    arguments: { from: "2026-08-01", to: "2026-08-22", group_by: "source" },
  }, { token: await jwt() });
  assert.equal(result.payload.result.isError, undefined);
  assert.deepEqual(result.payload.result.structuredContent.rows, [
    { value: "telegram", newUsers: 12 },
    { value: "unattributed", newUsers: 3 },
  ]);
  assert.equal(JSON.stringify(result.payload.result).includes("phx-test-secret"), false);
  assert.deepEqual(calls, [jwksUrl, "https://us.posthog.com/api/projects/123/query/"]);
});

test("generation stages retain independent-count semantics through the MCP contract", async (context) => {
  context.mock.method(globalThis, "fetch", async (input: unknown) => {
    if (String(input) === jwksUrl) return Response.json({ keys: [publicJwk] });
    return Response.json({ results: [["mini_app_opened", 12], ["generation_succeeded", 3], ["generation_result_viewed", 2]] });
  });
  const result = await mcp("tools/call", {
    name: "get_posthog_conversion_funnel",
    arguments: { from: "2026-09-01", to: "2026-09-16", source: null },
  }, { token: await jwt() });
  assert.equal(result.payload.result.isError, undefined);
  const content = result.payload.result.structuredContent;
  assert.equal(content.counting, "independent_unique_users");
  assert.equal(content.ordered, false);
  assert.deepEqual(content.steps.find((step: { event: string }) => step.event === "generation_succeeded"), { event: "generation_succeeded", users: 3 });
  assert.deepEqual(content.steps.find((step: { event: string }) => step.event === "generation_result_viewed"), { event: "generation_result_viewed", users: 2 });
});

test("JWT validation rejects wrong issuer, audience, scope, subject, expiry, and signature", async (context) => {
  const restoreFetch = mockJwks();
  context.after(restoreFetch);
  const now = Math.floor(Date.now() / 1_000);
  const otherKeys = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const cases = [
    await jwt({ iss: "http://attacker.invalid/" }),
    await jwt({ aud: "wrong-audience" }),
    await jwt({ scope: "profile.read" }),
    await jwt({ sub: "someone-else" }),
    await jwt({ exp: now - 60 }),
    await jwt({}, otherKeys.privateKey),
  ];
  for (const token of cases) {
    const request = new Request(mcpUrl, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(await verifyMcpBearer(request, env()), null);
  }
});

test("tool calls reject date ranges over 93 days before PostHog is queried", async (context) => {
  const originalFetch = globalThis.fetch;
  let posthogCalls = 0;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input) => {
    if (String(input) === jwksUrl) return Response.json({ keys: [publicJwk] });
    posthogCalls += 1;
    return Response.json({ results: [] });
  };

  const result = await mcp("tools/call", {
    name: "get_posthog_conversion_funnel",
    arguments: { from: "2026-01-01", to: "2026-04-04", source: null },
  }, { token: await jwt() });
  assert.equal(result.payload.result.isError, true);
  assert.match(result.payload.result.content[0].text, /1 and 93 days/);
  assert.equal(posthogCalls, 0);

  const invalidDate = await mcp("tools/call", {
    name: "get_posthog_overview",
    arguments: { from: "2026-02-30", to: "2026-03-01" },
  }, { token: await jwt() });
  assert.equal(invalidDate.payload.result.isError, true);
  assert.match(invalidDate.payload.result.content[0].text, /valid calendar dates/);
  assert.equal(posthogCalls, 0);
});
