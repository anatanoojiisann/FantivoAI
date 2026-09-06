import assert from "node:assert/strict";
import test from "node:test";
import { fetchStarTransactionPages, parseStarTransaction } from "../src/star-transactions.ts";

test("parses invoice payment AffiliateInfo for a user", async () => {
  const event = await parseStarTransaction({
    id: "charge-user-1",
    amount: 85,
    nanostar_amount: 250_000_000,
    date: 1_800_000_000,
    source: {
      type: "user",
      transaction_type: "invoice_payment",
      user: { id: 42, first_name: "Buyer" },
      invoice_payload: "v5|2026-08-04|ord_12345678-1234-1234-1234-123456789012",
      affiliate: {
        affiliate_user: { id: 9001, username: "creator" },
        commission_per_mille: 150,
        amount: 15,
        nanostar_amount: 0,
      },
    },
  }, "2026-08-09T00:00:00.000Z");

  assert.equal(event.direction, "incoming");
  assert.equal(event.transactionType, "invoice_payment");
  assert.equal(event.sourceUserId, "42");
  assert.equal(event.affiliateType, "user");
  assert.equal(event.affiliateUserId, "9001");
  assert.equal(event.affiliateName, "@creator");
  assert.equal(event.affiliateCommissionPerMille, 150);
  assert.equal(event.amount, 85);
  assert.equal(event.nanostarAmount, 250_000_000);
});

test("parses chat AffiliateInfo and preserves negative commission values", async () => {
  const event = await parseStarTransaction({
    id: "shared-refund-id",
    amount: -70,
    date: 1_800_000_100,
    source: {
      transaction_type: "invoice_payment",
      user: { id: 43 },
      affiliate: {
        affiliate_chat: { id: -1001234567890, title: "Creator Channel" },
        commission_per_mille: 200,
        amount: -20,
        nanostar_amount: -500_000_000,
      },
    },
  });

  assert.equal(event.affiliateType, "chat");
  assert.equal(event.affiliateChatId, "-1001234567890");
  assert.equal(event.affiliateName, "Creator Channel");
  assert.equal(event.amount, -70);
  assert.equal(event.affiliateAmount, -20);
  assert.equal(event.affiliateNanostarAmount, -500_000_000);
});

test("handles invoice payments without AffiliateInfo", async () => {
  const event = await parseStarTransaction({
    id: "charge-no-affiliate",
    amount: 100,
    date: 1_800_000_200,
    source: { transaction_type: "invoice_payment", user: { id: 44 }, invoice_payload: "legacy" },
  });
  assert.equal(event.affiliateType, null);
  assert.equal(event.affiliateUserId, null);
  assert.equal(event.affiliateChatId, null);
});

test("content hashes make duplicate syncs stable without assuming transaction ids are unique events", async () => {
  const left = await parseStarTransaction({ id: "same-id", amount: 10, date: 1_800_000_300, source: { user: { id: 1 }, transaction_type: "invoice_payment" } });
  const reordered = await parseStarTransaction({ source: { transaction_type: "invoice_payment", user: { id: 1 } }, date: 1_800_000_300, amount: 10, id: "same-id" });
  const changed = await parseStarTransaction({ id: "same-id", amount: -10, date: 1_800_000_400, receiver: { user: { id: 1 }, transaction_type: "invoice_payment" } });
  assert.equal(left.eventKey, reordered.eventKey);
  assert.notEqual(left.eventKey, changed.eventKey);
});

test("getStarTransactions pagination uses bounded offsets", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const fetcher: typeof fetch = async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
    const offset = Number(bodies.at(-1)?.offset || 0);
    return Response.json({ ok: true, result: { transactions: [{ id: `tx-${offset}`, amount: 1, date: 1_800_000_000 + offset }] } });
  };
  const result = await fetchStarTransactionPages("123:test", fetcher, { limit: 1, maxPages: 2 });
  assert.equal(result.transactions.length, 2);
  assert.deepEqual(bodies.map((body) => body.offset), [0, 1]);
  assert.ok(bodies.every((body) => body.limit === 1));
});
