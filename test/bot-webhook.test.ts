import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.ts";
import { TERMS_VERSION } from "../src/config.ts";
import { invoicePayload } from "../src/payment.ts";
import type { Env } from "../src/types.ts";

class MemoryKv {
  readonly values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async put(key: string, value: string) { this.values.set(key, value); }
}

test("language callback persists the selection and localizes the next start response", async (context) => {
  const originalFetch = globalThis.fetch;
  const telegramCalls: Array<{ method: string; body: Record<string, unknown> }> = [];
  context.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith("https://api.telegram.org/botlocal-test-token/")) throw new Error(`Unexpected request: ${url}`);
    telegramCalls.push({ method: url.split("/").at(-1) || "", body: JSON.parse(String(init?.body || "{}")) });
    return Response.json({ ok: true, result: {} });
  };

  const memory = new MemoryKv();
  const env = {
    USER_PREFERENCES: memory as unknown as KVNamespace,
    TELEGRAM_BOT_TOKEN: "local-test-token",
    TELEGRAM_WEBHOOK_SECRET: "local-webhook-secret",
    OPEN_PLATFORM_BASE_URL: "https://platform.invalid",
    OPEN_PLATFORM_API_KEY: "local-platform-key",
    OPEN_PLATFORM_CALLBACK_SECRET: "local-callback-secret",
    PUBLIC_WORKER_URL: "https://worker.invalid",
    DEFAULT_MODEL: "test-model",
  } as Env;

  const callbackResponse = await worker.fetch(new Request("https://worker.invalid/telegram/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": env.TELEGRAM_WEBHOOK_SECRET },
    body: JSON.stringify({
      update_id: 1,
      callback_query: { id: "callback-1", from: { id: 42 }, data: "lang:ru", message: { message_id: 1, chat: { id: 42, type: "private" } } },
    }),
  }), env);
  assert.equal(callbackResponse.status, 200);
  assert.equal(memory.values.get("telegram:locale:42"), "ru");
  assert.equal(telegramCalls[0]?.method, "answerCallbackQuery");
  assert.match(String(telegramCalls[1]?.body.text), /Русский/);

  telegramCalls.length = 0;
  const startResponse = await worker.fetch(new Request("https://worker.invalid/telegram/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": env.TELEGRAM_WEBHOOK_SECRET },
    body: JSON.stringify({ update_id: 2, message: { message_id: 2, chat: { id: 42, type: "private" }, from: { id: 42 }, text: "/start" } }),
  }), env);
  assert.equal(startResponse.status, 200);
  assert.equal(telegramCalls[0]?.method, "setChatMenuButton");
  assert.equal(telegramCalls[0]?.body.chat_id, 42);
  assert.equal((telegramCalls[0]?.body.menu_button as { type?: string })?.type, "default");
  assert.doesNotMatch(JSON.stringify(telegramCalls[0]?.body.menu_button), /worker\.invalid/);
  assert.equal(telegramCalls[1]?.method, "sendMessage");
  assert.match(String(telegramCalls[1]?.body.text), /<code>\/language<\/code> Язык: <b>Русский<\/b>/);
  assert.match(JSON.stringify(telegramCalls[1]?.body.reply_markup), /menu:language/);

  telegramCalls.length = 0;
  const appResponse = await worker.fetch(new Request("https://worker.invalid/telegram/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": env.TELEGRAM_WEBHOOK_SECRET },
    body: JSON.stringify({ update_id: 3, message: { message_id: 3, chat: { id: 42, type: "private" }, from: { id: 42 }, text: "/app" } }),
  }), env);
  assert.equal(appResponse.status, 200);
  assert.equal((telegramCalls[0]?.body.menu_button as { type?: string })?.type, "default");
  assert.equal(telegramCalls[1]?.method, "sendMessage");
  assert.match(JSON.stringify(telegramCalls[1]?.body.reply_markup), /worker\.invalid\/\?lang=ru/);
});

test("subscription first payment and renewal each credit one cycle and update KV state", async (context) => {
  const originalFetch = globalThis.fetch;
  const telegramCalls: Array<{ method: string; body: Record<string, unknown> }> = [];
  const paymentEvents: Array<Record<string, unknown>> = [];
  context.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://api.telegram.org/botlocal-test-token/")) {
      telegramCalls.push({ method: url.split("/").at(-1) || "", body: JSON.parse(String(init?.body || "{}")) });
      return Response.json({ ok: true, result: {} });
    }
    if (url.endsWith("/v1/users")) return Response.json({ user: {}, wallet: { balance: 0, version: 1 } });
    if (url.endsWith("/v1/payment-events")) {
      paymentEvents.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
      return Response.json({ wallet: { balance: paymentEvents.length * 3_000, version: paymentEvents.length + 1 }, applied: true });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const memory = new MemoryKv();
  const env = {
    USER_PREFERENCES: memory as unknown as KVNamespace,
    ADMIN_SERVICE: {
      fetch: async (request: Request) => new URL(request.url).pathname === "/api/public/v1/configuration"
        ? Response.json({ configuration: { subscriptionPlans: [{
          id: "pro", title: "Pro", description: "3,000 credits each cycle", stars: 650, creditsPerCycle: 3_000,
          periodSeconds: 2_592_000, status: "active", recommended: true, channels: ["Mini App"], termsVersion: TERMS_VERSION,
        }] } })
        : Response.json({ applied: true }),
    },
    ADMIN_SYNC_SECRET: "local-admin-sync-secret",
    TELEGRAM_BOT_TOKEN: "local-test-token",
    TELEGRAM_WEBHOOK_SECRET: "local-webhook-secret",
    OPEN_PLATFORM_BASE_URL: "https://platform.invalid",
    OPEN_PLATFORM_API_KEY: "local-platform-key",
    OPEN_PLATFORM_CALLBACK_SECRET: "local-callback-secret",
    PUBLIC_WORKER_URL: "https://worker.invalid",
    DEFAULT_MODEL: "test-model",
  } as unknown as Env;
  const payload = invoicePayload("pro", "telegram_42", TERMS_VERSION, "Mini App", "subscription", "subscription");
  const expiration1 = Math.floor(Date.now() / 1_000) + 2_592_000;
  const expiration2 = expiration1 + 2_592_000;

  const deliver = (updateId: number, chargeId: string, expiration: number, first: boolean) => worker.fetch(new Request("https://worker.invalid/telegram/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": env.TELEGRAM_WEBHOOK_SECRET },
    body: JSON.stringify({ update_id: updateId, message: {
      message_id: updateId, chat: { id: 42, type: "private" }, from: { id: 42 }, successful_payment: {
        currency: "XTR", total_amount: 650, invoice_payload: payload, telegram_payment_charge_id: chargeId,
        subscription_expiration_date: expiration, is_recurring: true, is_first_recurring: first,
      },
    } }),
  }), env);

  assert.equal((await deliver(10, "charge-first", expiration1, true)).status, 200);
  const firstState = JSON.parse(memory.values.get("telegram:subscription:42") || "{}") as Record<string, unknown>;
  assert.equal(firstState.planId, "pro");
  assert.equal(firstState.expiresAt, expiration1);
  assert.equal(paymentEvents[0]?.credits, 3_000);

  assert.equal((await deliver(11, "charge-renewal", expiration2, false)).status, 200);
  const renewedState = JSON.parse(memory.values.get("telegram:subscription:42") || "{}") as Record<string, unknown>;
  assert.equal(paymentEvents.length, 2);
  assert.equal(renewedState.startedAt, firstState.startedAt);
  assert.equal(renewedState.expiresAt, expiration2);
  assert.equal(renewedState.lastChargeId, "charge-renewal");
  assert.equal(renewedState.isCanceled, false);

  await memory.put("telegram:subscription:42", JSON.stringify({ ...renewedState, isCanceled: true }));
  assert.equal((await deliver(12, "charge-renewal", expiration2, false)).status, 200);
  const replayedState = JSON.parse(memory.values.get("telegram:subscription:42") || "{}") as Record<string, unknown>;
  assert.equal(replayedState.isCanceled, true, "a replayed successful_payment must not re-enable renewal");

  telegramCalls.length = 0;
  const mismatch = await worker.fetch(new Request("https://worker.invalid/telegram/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": env.TELEGRAM_WEBHOOK_SECRET },
    body: JSON.stringify({ update_id: 13, pre_checkout_query: { id: "precheckout-1", from: { id: 42 }, currency: "XTR", total_amount: 649, invoice_payload: payload } }),
  }), env);
  assert.equal(mismatch.status, 200);
  assert.equal(telegramCalls.at(-1)?.method, "answerPreCheckoutQuery");
  assert.equal(telegramCalls.at(-1)?.body.ok, false);

  telegramCalls.length = 0;
  const canceledRenewal = await worker.fetch(new Request("https://worker.invalid/telegram/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": env.TELEGRAM_WEBHOOK_SECRET },
    body: JSON.stringify({ update_id: 14, pre_checkout_query: { id: "precheckout-2", from: { id: 42 }, currency: "XTR", total_amount: 650, invoice_payload: payload } }),
  }), env);
  assert.equal(canceledRenewal.status, 200);
  assert.equal(telegramCalls.at(-1)?.method, "answerPreCheckoutQuery");
  assert.equal(telegramCalls.at(-1)?.body.ok, false);
});
