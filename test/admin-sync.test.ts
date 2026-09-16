import assert from "node:assert/strict";
import test from "node:test";
import { verifyIngestSignature } from "../admin-service/src/signature.ts";
import { createSignature, loadAdminCreditPacks, loadAdminSubscriptionPlans } from "../src/admin-sync.ts";
import type { Env } from "../src/types.ts";

test("Bot event signatures are accepted by the Admin Worker", async () => {
  const timestamp = "1785830400";
  const body = new TextEncoder().encode('{"eventId":"integration_123"}');
  const signature = await createSignature("shared-local-test-secret", timestamp, body);
  assert.equal(await verifyIngestSignature("shared-local-test-secret", timestamp, body.buffer, signature, 1_785_830_400_000), true);
});

test("Mini App subscriptions come only from active current-term admin plans", async () => {
  const env = {
    ADMIN_SERVICE: {
      fetch: async () => Response.json({ configuration: { subscriptionPlans: [
        { id: "standard", title: "Standard", description: "Monthly", stars: 250, creditsPerCycle: 1000, periodSeconds: 2592000, status: "active", recommended: true, channels: ["Mini App"], termsVersion: "2026-08-04" },
        { id: "draft", title: "Draft", description: "Hidden", stars: 1, creditsPerCycle: 1, periodSeconds: 2592000, status: "draft", recommended: false, channels: ["Mini App"], termsVersion: "2026-08-04" },
      ] } }),
    },
  } as unknown as Env;
  assert.deepEqual(await loadAdminSubscriptionPlans(env, [], "Mini App", "2026-08-04"), [
    { id: "standard", title: "Standard", description: "Monthly", stars: 250, creditsPerCycle: 1000, periodSeconds: 2592000, recommended: true },
  ]);
});

test("Bot and Mini App credit packs come from the active admin configuration", async () => {
  const env = {
    ADMIN_SERVICE: {
      fetch: async () => Response.json({ configuration: { creditPacks: [
        { id: "bot", title: "Bot Pack", description: "Bot only", stars: 10, baseCredits: 100, bonusCredits: 20, status: "active", recommended: true, channels: ["Bot"], termsVersion: "2026-08-04" },
        { id: "mini", title: "Mini Pack", description: "Mini only", stars: 20, baseCredits: 200, bonusCredits: 0, status: "active", recommended: false, channels: ["Mini App"], termsVersion: "2026-08-04" },
        { id: "old", title: "Old Pack", description: "Old terms", stars: 30, baseCredits: 300, bonusCredits: 0, status: "active", recommended: false, channels: ["Bot"], termsVersion: "2025-01-01" },
      ] } }),
    },
  } as unknown as Env;
  const fallback = [{ id: "fallback", title: "Fallback", description: "Fallback", stars: 1, credits: 1 }];
  assert.deepEqual(await loadAdminCreditPacks(env, fallback, "Bot", "2026-08-04"), [
    { id: "bot", title: "Bot Pack", description: "Bot only", stars: 10, credits: 120 },
  ]);
  assert.deepEqual(await loadAdminCreditPacks(env, fallback, "Mini App", "2026-08-04"), [
    { id: "mini", title: "Mini Pack", description: "Mini only", stars: 20, credits: 200 },
  ]);
});

test("concurrent bootstrap configuration readers share one request and retry after failure", async () => {
  let calls = 0;
  let fail = true;
  const env = { ADMIN_SERVICE: { fetch: async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (fail) return new Response("unavailable", { status: 503 });
    return Response.json({ configuration: {} });
  } } } as unknown as Env;
  await Promise.all([loadAdminCreditPacks(env, [], "Mini App", "test"), loadAdminSubscriptionPlans(env, [], "Mini App", "test")]);
  assert.equal(calls, 1);
  fail = false;
  await loadAdminCreditPacks(env, [], "Mini App", "test");
  await loadAdminSubscriptionPlans(env, [], "Mini App", "test");
  assert.equal(calls, 2);
});
