import assert from "node:assert/strict";
import test from "node:test";
import { IDLE_SUBSCRIPTION_PURCHASE, reduceSubscriptionPurchase } from "../web/src/subscription-purchase.ts";

test("subscription purchase stays locked while the invoice is created and displayed", () => {
  const creating = reduceSubscriptionPurchase(IDLE_SUBSCRIPTION_PURCHASE, { type: "start", productId: "sub_pro" });
  const duplicate = reduceSubscriptionPurchase(creating, { type: "start", productId: "sub_standard" });
  const awaiting = reduceSubscriptionPurchase(duplicate, { type: "invoice_opened" });

  assert.deepEqual(creating, { phase: "creating_invoice", productId: "sub_pro" });
  assert.equal(duplicate, creating);
  assert.deepEqual(awaiting, { phase: "awaiting_payment", productId: "sub_pro" });
});

test("subscription purchase unlocks only after cancellation, failure or invoice creation error", () => {
  const awaiting = { phase: "awaiting_payment" as const, productId: "sub_pro" };
  assert.equal(reduceSubscriptionPurchase(awaiting, { type: "invoice_result", status: "cancelled" }).phase, "idle");
  assert.equal(reduceSubscriptionPurchase(awaiting, { type: "invoice_result", status: "failed" }).phase, "idle");
  assert.equal(reduceSubscriptionPurchase(awaiting, { type: "invoice_error" }).phase, "idle");
});

test("paid and pending invoices remain locked until the subscription is observed", () => {
  const awaiting = { phase: "awaiting_payment" as const, productId: "sub_pro" };
  for (const status of ["paid", "pending"] as const) {
    const syncing = reduceSubscriptionPurchase(awaiting, { type: "invoice_result", status });
    assert.deepEqual(syncing, { phase: "syncing_subscription", productId: "sub_pro" });
    assert.equal(reduceSubscriptionPurchase(syncing, { type: "start", productId: "sub_standard" }), syncing);
    assert.equal(reduceSubscriptionPurchase(syncing, { type: "subscription_observed" }).phase, "idle");
  }
});
