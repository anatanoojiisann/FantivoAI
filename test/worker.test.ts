import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.ts";
import type { Env } from "../src/types.ts";

function envWithAssets(): Env {
  return {
    ASSETS: { fetch: async () => new Response("<h1>AuraX</h1>", { headers: { "Content-Type": "text/html" } }) },
    TELEGRAM_BOT_TOKEN: "local-test-token",
    TELEGRAM_WEBHOOK_SECRET: "local-webhook-secret",
    OPEN_PLATFORM_BASE_URL: "https://platform.invalid",
    OPEN_PLATFORM_API_KEY: "local-platform-key",
    OPEN_PLATFORM_CALLBACK_SECRET: "local-callback-secret",
    PUBLIC_WORKER_URL: "https://worker.invalid",
    DEFAULT_MODEL: "test-model",
  };
}

test("serves static assets with production security headers", async () => {
  const response = await worker.fetch(new Request("https://worker.invalid/"), envWithAssets());
  assert.equal(response.status, 200);
  const csp = response.headers.get("Content-Security-Policy") || "";
  assert.match(csp, /script-src 'self' https:\/\/telegram\.org/);
  assert.match(csp, /connect-src 'self' https:\/\/us\.i\.posthog\.com/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /\*\.posthog\.com|unsafe-inline|unsafe-eval/);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("Strict-Transport-Security"), "max-age=31536000");
});

test("health endpoint is public but Mini App API fails closed", async () => {
  const env = envWithAssets();
  const health = await worker.fetch(new Request("https://worker.invalid/health"), env);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("Strict-Transport-Security"), "max-age=31536000");
  assert.deepEqual(await health.json(), { ok: true, service: "fantivo-ai-bot" });

  const api = await worker.fetch(new Request("https://worker.invalid/api/bootstrap"), env);
  assert.equal(api.status, 401);
});
