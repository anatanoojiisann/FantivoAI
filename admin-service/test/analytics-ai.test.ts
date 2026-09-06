import assert from "node:assert/strict";
import test from "node:test";
import { analyzeMiniAppAnalytics } from "../src/analytics-ai.ts";
import type { Env } from "../src/types.ts";

function env(overrides: Partial<Env> = {}) {
  return {
    POSTHOG_PERSONAL_API_KEY: "phx-local",
    POSTHOG_PROJECT_ID: "123",
    POSTHOG_HOST: "https://us.posthog.com",
    OPENAI_API_KEY: "sk-local",
    OPENAI_MODEL: "gpt-5.6",
    ...overrides,
  } as Env;
}

test("GPT analytics reports missing server-side integrations without making a request", async () => {
  const result = await analyzeMiniAppAnalytics({} as Env, "分析来源", "2026-08-01", "2026-08-22");
  assert.equal(result.status, "not_configured");
  assert.deepEqual(result.missing, ["PostHog", "OpenAI"]);
});

test("GPT analytics executes only a declared PostHog tool and returns the final answer", async (context) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; authorization: string; body: Record<string, unknown> }> = [];
  let openaiCalls = 0;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    requests.push({ url, authorization: new Headers(init?.headers).get("Authorization") || "", body });
    if (url === "https://api.openai.com/v1/responses") {
      openaiCalls += 1;
      if (openaiCalls === 1) return Response.json({ output: [{ type: "function_call", call_id: "call_acq", name: "get_acquisition_breakdown", arguments: '{"from":"2026-08-01","to":"2026-08-22","group_by":"source"}' }] });
      return Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: "结论：小红书带来 12 位新用户。" }] }] });
    }
    return Response.json({ results: [["xhs", 12], ["telegram_organic", 5]] });
  };

  const result = await analyzeMiniAppAnalytics(env(), "哪个来源的新用户最多？", "2026-08-01", "2026-08-22");
  assert.equal(result.status, "ready");
  assert.equal(result.answer, "结论：小红书带来 12 位新用户。");
  assert.equal(result.toolsUsed?.[0]?.name, "get_acquisition_breakdown");
  assert.equal(requests.filter((item) => item.url.includes("posthog.com")).length, 1);
  assert.match(JSON.stringify(requests[1].body), /argMin/);
  assert.equal(requests[0].authorization, "Bearer sk-local");
  assert.equal(requests[0].body.store, false);
  assert.doesNotMatch(JSON.stringify(requests[0].body.tools), /hogql|sql|query/i);
  assert.match(JSON.stringify(requests.at(-1)?.body.input), /function_call_output/);
});

test("GPT analytics bounds every tool query to 93 days", async () => {
  await assert.rejects(() => analyzeMiniAppAnalytics(env(), "分析全年来源", "2026-01-01", "2026-08-22"), /1–93 天/);
});
