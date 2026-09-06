import assert from "node:assert/strict";
import test from "node:test";
import { TERMS_VERSION } from "../src/config.ts";
import { invoicePayload, orderInvoicePayload, parseInvoicePayload } from "../src/payment.ts";

test("round-trips a current terms-aware invoice payload", () => {
  const value = invoicePayload("starter", "telegram_424242");
  assert.deepEqual(parseInvoicePayload(value), {
    productId: "starter",
    externalUserId: "telegram_424242",
    termsVersion: TERMS_VERSION,
    productType: "credit_pack",
  });
});

test("rejects legacy or stale invoice payloads", () => {
  assert.equal(parseInvoicePayload("v1|starter|telegram_424242"), null);
  assert.equal(parseInvoicePayload("v2|2025-01-01|starter|telegram_424242"), null);
});

test("Mini App invoices retain their payment funnel source", () => {
  const value = invoicePayload("creator", "telegram_424242", TERMS_VERSION, "Mini App", "wallet");
  assert.deepEqual(parseInvoicePayload(value), {
    productId: "creator",
    externalUserId: "telegram_424242",
    termsVersion: TERMS_VERSION,
    productType: "credit_pack",
    channel: "Mini App",
    funnelEntry: "wallet",
  });
});

test("subscription invoices use a distinct v4 payload without breaking v2 or v3", () => {
  const value = invoicePayload("pro", "telegram_424242", TERMS_VERSION, "Mini App", "subscription", "subscription");
  assert.match(value, /^v4\|/);
  assert.deepEqual(parseInvoicePayload(value), {
    productId: "pro",
    externalUserId: "telegram_424242",
    termsVersion: TERMS_VERSION,
    productType: "subscription",
    channel: "Mini App",
    funnelEntry: "subscription",
  });
  assert.equal(parseInvoicePayload(`v4|${TERMS_VERSION}|credit_pack|pro|telegram_424242|mini_app|subscription`), null);
});

test("payment orders use a unique v5 payload and reject malformed order ids", () => {
  const orderId = "ord_12345678-1234-1234-1234-123456789012";
  const value = orderInvoicePayload(orderId);
  assert.deepEqual(parseInvoicePayload(value), {
    orderId,
    termsVersion: TERMS_VERSION,
    productType: "credit_pack",
  });
  assert.equal(parseInvoicePayload(`v5|${TERMS_VERSION}|ord_bad`), null);
  assert.throws(() => orderInvoicePayload("ord_bad"), /Invalid payment order id/);
});
