import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.ts";
import { TERMS_VERSION } from "../src/config.ts";
import type { Env } from "../src/types.ts";

const encoder = new TextEncoder();
const BOT_TOKEN = "local-test-token";

async function signedInitData(userId = 42) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1_000) - 5),
    query_id: `query-${userId}`,
    user: JSON.stringify({ id: userId, first_name: "Test", username: `user_${userId}` }),
  });
  const dataCheckString = [...params.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join("\n");
  const webAppDataKey = await crypto.subtle.importKey("raw", encoder.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const secretKey = await crypto.subtle.sign("HMAC", webAppDataKey, encoder.encode(BOT_TOKEN));
  const validationKey = await crypto.subtle.importKey("raw", secretKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", validationKey, encoder.encode(dataCheckString));
  params.set("hash", [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join(""));
  return params.toString();
}

function fixture() {
  const orders = new Map<string, Record<string, unknown>>();
  const adminEvents: Array<Record<string, unknown>> = [];
  const adminEventIds = new Set<string>();
  const service = {
    async fetch(request: Request) {
      const url = new URL(request.url);
      if (url.pathname === "/api/public/v1/configuration") {
        return Response.json({ configuration: { creditPacks: [{
          id: "starter", title: "Starter Pack", description: "500 credits", stars: 100, baseCredits: 500, bonusCredits: 0,
          status: "active", recommended: false, channels: ["Bot", "Mini App"], termsVersion: TERMS_VERSION,
        }] } });
      }
      if (request.method === "POST" && url.pathname === "/api/ingest/v1/payment-orders") {
        const input = await request.json<Record<string, unknown>>();
        const order = {
          ...input, status: "PENDING", telegramPaymentChargeId: null, updatedAt: input.createdAt,
          precheckoutApprovedAt: null, paidAt: null, failedAt: null,
        };
        orders.set(String(input.id), order);
        return Response.json({ order }, { status: 201 });
      }
      const action = /^\/api\/ingest\/v1\/payment-orders\/([^/]+)\/(precheckout|failed)$/.exec(url.pathname);
      if (request.method === "POST" && action) {
        const order = orders.get(action[1]);
        if (!order) return Response.json({ message: "not found" }, { status: 404 });
        order.status = action[2] === "precheckout" ? "PRECHECKOUT_APPROVED" : "FAILED";
        return Response.json({ order });
      }
      const lookup = /^\/api\/ingest\/v1\/payment-orders\/([^/]+)$/.exec(url.pathname);
      if (request.method === "GET" && lookup) {
        const order = orders.get(lookup[1]);
        return order ? Response.json({ order }) : Response.json({ message: "not found" }, { status: 404 });
      }
      if (request.method === "POST" && url.pathname === "/api/ingest/v1/events") {
        const event = await request.json<Record<string, unknown>>();
        const eventId = String(event.eventId || "");
        if (adminEventIds.has(eventId)) return Response.json({ applied: false, duplicate: true });
        adminEventIds.add(eventId);
        adminEvents.push(event);
        if (event.type === "payment.credited") {
          const data = event.data as { payment?: { orderId?: string; transactionId?: string } };
          const order = data.payment?.orderId ? orders.get(data.payment.orderId) : undefined;
          if (order) {
            order.status = "PAID";
            order.telegramPaymentChargeId = data.payment?.transactionId || null;
            order.paidAt = event.occurredAt;
          }
        }
        return Response.json({ applied: true });
      }
      throw new Error(`Unexpected Admin request: ${request.method} ${url.pathname}`);
    },
  };
  const env = {
    ADMIN_SERVICE: service,
    ADMIN_SYNC_SECRET: "local-admin-sync-secret",
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: "local-webhook-secret",
    OPEN_PLATFORM_BASE_URL: "https://platform.invalid",
    OPEN_PLATFORM_API_KEY: "local-platform-key",
    OPEN_PLATFORM_CALLBACK_SECRET: "local-callback-secret",
    PUBLIC_WORKER_URL: "https://worker.invalid",
    DEFAULT_MODEL: "test-model",
  } as unknown as Env;
  return { env, orders, adminEvents };
}

async function createOrder(env: Env, initData: string, extra: Record<string, unknown> = {}) {
  return worker.fetch(new Request("https://worker.invalid/api/payments/telegram-stars/orders", {
    method: "POST",
    headers: { "Authorization": `tma ${initData}`, "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: "starter", productType: "credit_pack", termsVersion: TERMS_VERSION, ...extra }),
  }), env);
}

test("creates a unique XTR order using the backend product price and ignores a forged client price", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const telegramBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/createInvoiceLink")) {
      telegramBodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
      return Response.json({ ok: true, result: "https://t.me/$invoice-order" });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const { env } = fixture();
  const initData = await signedInitData();
  const response = await createOrder(env, initData, { stars_price: 1, productType: undefined, termsVersion: undefined });
  assert.equal(response.status, 201);
  const body = await response.json<{ order_id: string; invoice_url: string }>();
  assert.match(body.order_id, /^ord_/);
  assert.equal(body.invoice_url, "https://t.me/$invoice-order");
  assert.equal(telegramBodies[0]?.currency, "XTR");
  assert.deepEqual(telegramBodies[0]?.prices, [{ label: "Starter Pack", amount: 100 }]);
  assert.equal("provider_token" in (telegramBodies[0] || {}), false);
  assert.match(String(telegramBodies[0]?.payload), new RegExp(`^v5\\|${TERMS_VERSION}\\|ord_`));

  const status = await worker.fetch(new Request(`https://worker.invalid/api/payments/telegram-stars/orders/${body.order_id}`, {
    headers: { "Authorization": `tma ${initData}` },
  }), env);
  assert.equal(status.status, 200);
  assert.equal((await status.json<{ status: string }>()).status, "PENDING");
});

test("pre-checkout validates order amount and Telegram user before approval", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const telegramCalls: Array<{ method: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    telegramCalls.push({ method: url.split("/").at(-1) || "", body: JSON.parse(String(init?.body || "{}")) });
    return url.includes("createInvoiceLink") ? Response.json({ ok: true, result: "https://t.me/$invoice" }) : Response.json({ ok: true, result: true });
  };
  const { env, orders } = fixture();
  const created = await createOrder(env, await signedInitData());
  const { order_id: orderId } = await created.json<{ order_id: string }>();
  const payload = String(orders.get(orderId)?.invoicePayload);

  const deliver = (id: number, userId: number, amount: number) => worker.fetch(new Request("https://worker.invalid/telegram/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": env.TELEGRAM_WEBHOOK_SECRET },
    body: JSON.stringify({ update_id: id, pre_checkout_query: { id: `pre-${id}`, from: { id: userId }, currency: "XTR", total_amount: amount, invoice_payload: payload } }),
  }), env);

  assert.equal((await deliver(1, 42, 100)).status, 200);
  assert.equal(telegramCalls.at(-1)?.body.ok, true);
  orders.get(orderId)!.status = "PENDING";
  assert.equal((await deliver(2, 42, 99)).status, 200);
  assert.equal(telegramCalls.at(-1)?.body.ok, false);
  assert.equal((await deliver(3, 43, 100)).status, 200);
  assert.equal(telegramCalls.at(-1)?.body.ok, false);
});

test("concurrent duplicate successful_payment deliveries keep one charge id and one credit application", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const platformPayments: Array<Record<string, unknown>> = [];
  const appliedCharges = new Set<string>();
  let creditedApplications = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("api.telegram.org")) {
      if (url.includes("createInvoiceLink")) return Response.json({ ok: true, result: "https://t.me/$invoice" });
      return Response.json({ ok: true, result: true });
    }
    if (url.endsWith("/v1/users")) return Response.json({ user: {}, wallet: { balance: 0, version: 1 } });
    if (url.endsWith("/v1/payment-events")) {
      const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
      platformPayments.push(body);
      const charge = String(body.transactionId);
      const applied = !appliedCharges.has(charge);
      if (applied) { appliedCharges.add(charge); creditedApplications += 1; }
      return Response.json({ wallet: { balance: 500, version: 2 }, applied });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const { env, orders, adminEvents } = fixture();
  const created = await createOrder(env, await signedInitData());
  const { order_id: orderId } = await created.json<{ order_id: string }>();
  const payload = String(orders.get(orderId)?.invoicePayload);
  const deliver = (updateId: number) => worker.fetch(new Request("https://worker.invalid/telegram/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": env.TELEGRAM_WEBHOOK_SECRET },
    body: JSON.stringify({ update_id: updateId, message: {
      message_id: updateId, chat: { id: 42, type: "private" }, from: { id: 42 },
      successful_payment: { currency: "XTR", total_amount: 100, invoice_payload: payload, telegram_payment_charge_id: "charge-once" },
    } }),
  }), env);

  const responses = await Promise.all([deliver(10), deliver(11), deliver(12), deliver(13), deliver(14)]);
  assert.ok(responses.every((response) => response.status === 200));
  assert.equal(creditedApplications, 1);
  assert.equal(appliedCharges.size, 1);
  assert.ok(platformPayments.every((payment) => payment.amount === 100 && payment.credits === 500 && payment.transactionId === "charge-once"));
  assert.equal(orders.get(orderId)?.status, "PAID");
  assert.equal(orders.get(orderId)?.telegramPaymentChargeId, "charge-once");
  const credited = adminEvents.filter((event) => event.type === "payment.credited");
  assert.equal(credited.length, 1);
  assert.ok(credited.every((event) => (event.data as { payment?: { orderId?: string } }).payment?.orderId === orderId));
});
