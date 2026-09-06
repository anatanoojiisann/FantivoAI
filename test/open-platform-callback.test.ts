import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { OpenPlatformClient } from "../src/open-platform.ts";
import type { Env } from "../src/types.ts";

function env(callbackUrl?: string): Env {
  return {
    TELEGRAM_BOT_TOKEN: "local-bot-token",
    TELEGRAM_WEBHOOK_SECRET: "local-webhook-secret",
    OPEN_PLATFORM_BASE_URL: "https://platform.invalid",
    OPEN_PLATFORM_API_KEY: "local-platform-key",
    OPEN_PLATFORM_CALLBACK_SECRET: "local-callback-secret",
    OPEN_PLATFORM_CALLBACK_URL: callbackUrl,
    PUBLIC_WORKER_URL: "https://worker.invalid",
    DEFAULT_MODEL: "peach-max",
  };
}

async function creationBody(context: TestContext, callbackUrl?: string) {
  const originalFetch = globalThis.fetch;
  let body: Record<string, unknown> = {};
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    return Response.json({
      job: {
        id: "job-callback-test",
        externalUserId: "telegram_42",
        status: "queued",
        progress: 0,
        model: "peach-max",
        creditCost: 300,
      },
      replayed: false,
    });
  };
  await new OpenPlatformClient(env(callbackUrl)).createJob({
    user: { id: 42, first_name: "Test" },
    idempotencyKey: "telegram-mini-app-42-callback-test",
    mode: "text-to-video",
    prompt: "A safe callback test prompt",
  });
  return body;
}

test("generation omits callbackUrl until a platform-allowlisted URL is configured", async (context) => {
  const body = await creationBody(context);
  assert.equal(body.callbackUrl, undefined);
});

test("generation includes an explicitly configured HTTPS callback URL", async (context) => {
  const body = await creationBody(context, "https://worker.invalid/platform/events");
  assert.equal(body.callbackUrl, "https://worker.invalid/platform/events");
});

test("generation ignores an invalid optional callback URL and remains pollable", async (context) => {
  const body = await creationBody(context, "http://worker.invalid/platform/events");
  assert.equal(body.callbackUrl, undefined);
});
