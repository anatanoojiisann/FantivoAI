import assert from "node:assert/strict";
import test from "node:test";
import { fetchMiniAppAnalytics, fetchModelCatalog, validateGenerationAgainstCatalog, type ModelCatalog } from "../src/integrations.ts";
import type { Env } from "../src/types.ts";

function env(overrides: Partial<Env> = {}) {
  return {
    OPEN_PLATFORM_BASE_URL: "https://platform.invalid",
    OPEN_PLATFORM_API_KEY: "local-platform-key",
    ...overrides,
  } as Env;
}

const catalog: ModelCatalog = {
  status: "ready",
  version: "models-v1",
  syncedAt: "2026-08-05T00:00:00.000Z",
  responseTimeMs: 10,
  models: [{ id: "peach-max", name: "Peach Max", creditCost: 60, modes: ["text-to-video", "image-to-video"], durations: [5, 10], aspectRatios: ["9:16", "16:9"], qualities: ["standard"], supportsAudio: true, enabled: true }],
};

test("generation configuration is constrained by the live model catalog", () => {
  assert.equal(validateGenerationAgainstCatalog({ model: "peach-max", durationSeconds: 5, aspectRatio: "9:16", quality: "standard", audioEnabled: true }, catalog).id, "peach-max");
  assert.throws(() => validateGenerationAgainstCatalog({ model: "missing", durationSeconds: 5, aspectRatio: "9:16", quality: "standard", audioEnabled: true }, catalog), /不在 Open Platform/);
  assert.throws(() => validateGenerationAgainstCatalog({ model: "peach-max", durationSeconds: 8, aspectRatio: "9:16", quality: "standard", audioEnabled: true }, catalog), /不支持 8 秒/);
  assert.throws(() => validateGenerationAgainstCatalog({ model: "peach-max", durationSeconds: 5, aspectRatio: "1:1", quality: "standard", audioEnabled: true }, catalog), /不支持 1:1/);
});

test("model catalog stays behind the server-side platform key", async (context) => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; authorization: string }> = [];
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, authorization: new Headers(init?.headers).get("Authorization") || "" });
    return Response.json({ version: "models-v2", models: catalog.models });
  };

  assert.equal((await fetchModelCatalog(env())).version, "models-v2");
  assert.deepEqual(calls, [
    { url: "https://platform.invalid/v1/models", authorization: "Bearer local-platform-key" },
  ]);
});

test("PostHog analytics degrades cleanly when Worker secrets are absent", async () => {
  const result = await fetchMiniAppAnalytics(env(), "2026-07-30", "2026-08-05");
  assert.equal(result.status, "not_configured");
  assert.equal(result.configured, false);
});
