import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.ts";
import type { Env, OpenPlatformJob } from "../src/types.ts";

class MemoryKv {
  readonly values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async put(key: string, value: string) { this.values.set(key, value); }
}

function notificationEnv(memory: MemoryKv): Env {
  return {
    USER_PREFERENCES: memory as unknown as KVNamespace,
    TELEGRAM_BOT_TOKEN: "local-notification-token",
    TELEGRAM_WEBHOOK_SECRET: "local-webhook-secret",
    OPEN_PLATFORM_BASE_URL: "https://platform.invalid",
    OPEN_PLATFORM_API_KEY: "local-platform-key",
    OPEN_PLATFORM_CALLBACK_SECRET: "local-callback-secret",
    OPEN_PLATFORM_CALLBACK_URL: "https://worker.invalid/platform/events",
    PUBLIC_WORKER_URL: "https://worker.invalid",
    DEFAULT_MODEL: "test-model",
  };
}

async function signedCallback(env: Env, job: OpenPlatformJob, signatureSecret = env.OPEN_PLATFORM_CALLBACK_SECRET) {
  const body = JSON.stringify({ type: "generation.completed", job });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(signatureSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const signature = [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return worker.fetch(new Request("https://worker.invalid/platform/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Bot-Platform-Signature": `sha256=${signature}` },
    body,
  }), env);
}

function completedJob(overrides: Partial<OpenPlatformJob> = {}): OpenPlatformJob {
  return {
    id: "job_notification_success",
    externalUserId: "telegram_42",
    status: "succeeded",
    progress: 100,
    model: "test-model",
    creditCost: 60,
    idempotencyKey: "telegram-mini-app-42-notification-test",
    outputUrl: "https://cdn.invalid/result.mp4",
    ...overrides,
  };
}

test("a signed completion callback sends the video once with Mini App actions", async (context) => {
  const originalFetch = globalThis.fetch;
  const telegramCalls: Array<{ method: string; body: Record<string, unknown> }> = [];
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith("https://api.telegram.org/botlocal-notification-token/")) throw new Error(`Unexpected request: ${url}`);
    telegramCalls.push({ method: url.split("/").at(-1) || "", body: JSON.parse(String(init?.body || "{}")) });
    return Response.json({ ok: true, result: { message_id: 1 } });
  };

  const memory = new MemoryKv();
  memory.values.set("telegram:locale:42", "zh-CN");
  const env = notificationEnv(memory);
  const first = await signedCallback(env, completedJob());
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { ok: true });
  assert.equal(telegramCalls.length, 1);
  assert.equal(telegramCalls[0]?.method, "sendVideo");
  assert.equal(telegramCalls[0]?.body.chat_id, 42);
  assert.equal(telegramCalls[0]?.body.video, "https://cdn.invalid/result.mp4");
  assert.match(String(telegramCalls[0]?.body.caption), /视频生成完成/);
  assert.match(JSON.stringify(telegramCalls[0]?.body.reply_markup), /worker\.invalid\/?\?lang=zh-CN/);
  assert.equal(memory.values.get("telegram:generation-notification:job_notification_success"), "sent");

  const replay = await signedCallback(env, completedJob());
  assert.deepEqual(await replay.json(), { ok: true, duplicate: true });
  assert.equal(telegramCalls.length, 1, "callback replays must not send a duplicate notification");
});

test("failed generation notifications explain timeout, refund and support", async (context) => {
  const originalFetch = globalThis.fetch;
  const telegramCalls: Array<{ method: string; body: Record<string, unknown> }> = [];
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://api.telegram.org/botlocal-notification-token/")) {
      telegramCalls.push({ method: url.split("/").at(-1) || "", body: JSON.parse(String(init?.body || "{}")) });
      return Response.json({ ok: true, result: { message_id: 2 } });
    }
    if (url.endsWith("/v1/users/telegram_42/wallet")) return Response.json({ wallet: { balance: 120, version: 2 } });
    throw new Error(`Unexpected request: ${url}`);
  };

  const memory = new MemoryKv();
  memory.values.set("telegram:locale:42", "zh-CN");
  const response = await signedCallback(notificationEnv(memory), completedJob({
    id: "job_notification_failed",
    status: "failed",
    outputUrl: undefined,
    failureCode: "provider_timeout",
    creditsRefunded: true,
  }));
  assert.equal(response.status, 200);
  assert.equal(telegramCalls[0]?.method, "sendMessage");
  const text = String(telegramCalls[0]?.body.text);
  assert.match(text, /生成耗时过长/);
  assert.match(text, /credits 已退回/);
  assert.match(text, /\/support/);
});

test("video delivery falls back to a message with the result link", async (context) => {
  const originalFetch = globalThis.fetch;
  const telegramCalls: Array<{ method: string; body: Record<string, unknown> }> = [];
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input, init) => {
    const method = String(input).split("/").at(-1) || "";
    const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    telegramCalls.push({ method, body });
    if (method === "sendVideo") return Response.json({ ok: false, description: "Telegram could not fetch the video" }, { status: 400 });
    return Response.json({ ok: true, result: { message_id: 3 } });
  };

  const response = await signedCallback(notificationEnv(new MemoryKv()), completedJob({ id: "job_notification_fallback" }));
  assert.equal(response.status, 200);
  assert.deepEqual(telegramCalls.map((call) => call.method), ["sendVideo", "sendMessage"]);
  assert.match(String(telegramCalls[1]?.body.text), /https:\/\/cdn\.invalid\/result\.mp4/);
});

test("generation callbacks reject an invalid platform signature", async () => {
  const response = await signedCallback(notificationEnv(new MemoryKv()), completedJob(), "wrong-secret");
  assert.equal(response.status, 401);
});
