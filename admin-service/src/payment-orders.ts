import type { PaymentOrder, PaymentOrderStatus } from "../../shared/contracts";
export type { PaymentOrder, PaymentOrderStatus } from "../../shared/contracts";

import { HttpError } from "./types";

type PaymentOrderRow = {
  id: string;
  order_no: string;
  external_user_id: string;
  telegram_user_id: number;
  product_id: string;
  product_title: string;
  product_type: "credit_pack" | "subscription";
  stars_amount: number;
  credits_amount: number;
  invoice_payload: string;
  status: PaymentOrderStatus;
  telegram_payment_charge_id: string | null;
  channel: "Bot" | "Mini App";
  funnel_entry: string;
  terms_version: string;
  created_at: string;
  updated_at: string;
  precheckout_approved_at: string | null;
  paid_at: string | null;
  failed_at: string | null;
};

export async function createPaymentOrder(db: D1Database, input: unknown) {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const order: PaymentOrder = {
    id: text(value.id, "id", /^ord_[a-f0-9-]{32,48}$/i),
    orderNo: text(value.orderNo, "orderNo", /^FTV-[A-Z0-9-]{10,40}$/),
    externalUserId: text(value.externalUserId, "externalUserId", /^telegram_\d+$/),
    telegramUserId: integer(value.telegramUserId, "telegramUserId", 1, Number.MAX_SAFE_INTEGER),
    productId: text(value.productId, "productId", /^[a-z0-9][a-z0-9_-]{1,39}$/),
    productTitle: text(value.productTitle, "productTitle", /^.{1,80}$/u),
    productType: value.productType === "subscription" ? "subscription" : "credit_pack",
    starsAmount: integer(value.starsAmount, "starsAmount", 1, 1_000_000),
    creditsAmount: integer(value.creditsAmount, "creditsAmount", 1, 10_000_000),
    invoicePayload: text(value.invoicePayload, "invoicePayload", /^v5\|\d{4}-\d{2}-\d{2}\|ord_[a-f0-9-]{32,48}$/i),
    status: "PENDING",
    telegramPaymentChargeId: null,
    channel: value.channel === "Bot" ? "Bot" : "Mini App",
    funnelEntry: text(value.funnelEntry, "funnelEntry", /^[a-z0-9_-]{2,40}$/),
    termsVersion: text(value.termsVersion, "termsVersion", /^\d{4}-\d{2}-\d{2}$/),
    createdAt: iso(value.createdAt),
    updatedAt: iso(value.createdAt),
    precheckoutApprovedAt: null,
    paidAt: null,
    failedAt: null,
  };
  if (order.externalUserId !== `telegram_${order.telegramUserId}`) throw new HttpError(422, "invalid_order", "订单用户标识不一致。");

  await db.prepare(`INSERT OR IGNORE INTO telegram_payment_orders(id, order_no, external_user_id, telegram_user_id, product_id,
    product_title, product_type, stars_amount, credits_amount, invoice_payload, status, channel, funnel_entry, terms_version,
    created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?)`)
    .bind(order.id, order.orderNo, order.externalUserId, order.telegramUserId, order.productId, order.productTitle,
      order.productType, order.starsAmount, order.creditsAmount, order.invoicePayload, order.channel, order.funnelEntry,
      order.termsVersion, order.createdAt, order.updatedAt).run();

  const stored = await loadPaymentOrder(db, order.id);
  if (stored.orderNo !== order.orderNo || stored.externalUserId !== order.externalUserId || stored.productId !== order.productId
    || stored.starsAmount !== order.starsAmount || stored.creditsAmount !== order.creditsAmount || stored.invoicePayload !== order.invoicePayload) {
    throw new HttpError(409, "order_conflict", "订单标识已被其他请求使用。");
  }
  return stored;
}

export async function loadPaymentOrder(db: D1Database, id: string) {
  if (!/^ord_[a-f0-9-]{32,48}$/i.test(id)) throw new HttpError(422, "invalid_order_id", "订单 ID 格式无效。");
  const row = await db.prepare("SELECT * FROM telegram_payment_orders WHERE id = ?").bind(id).first<PaymentOrderRow>();
  if (!row) throw new HttpError(404, "payment_order_not_found", "没有找到这笔支付订单。");
  return publicPaymentOrder(row);
}

export async function markPaymentOrderPrecheckoutApproved(db: D1Database, id: string) {
  const now = new Date().toISOString();
  await db.prepare(`UPDATE telegram_payment_orders SET status = 'PRECHECKOUT_APPROVED', precheckout_approved_at = COALESCE(precheckout_approved_at, ?),
    updated_at = ? WHERE id = ? AND status IN ('PENDING', 'PRECHECKOUT_APPROVED')`).bind(now, now, id).run();
  return loadPaymentOrder(db, id);
}

export async function markPaymentOrderFailed(db: D1Database, id: string) {
  const now = new Date().toISOString();
  await db.prepare(`UPDATE telegram_payment_orders SET status = 'FAILED', failed_at = COALESCE(failed_at, ?), updated_at = ?
    WHERE id = ? AND status = 'PENDING'`).bind(now, now, id).run();
  return loadPaymentOrder(db, id);
}

function publicPaymentOrder(row: PaymentOrderRow): PaymentOrder {
  return {
    id: row.id,
    orderNo: row.order_no,
    externalUserId: row.external_user_id,
    telegramUserId: Number(row.telegram_user_id),
    productId: row.product_id,
    productTitle: row.product_title,
    productType: row.product_type,
    starsAmount: Number(row.stars_amount),
    creditsAmount: Number(row.credits_amount),
    invoicePayload: row.invoice_payload,
    status: row.status,
    telegramPaymentChargeId: row.telegram_payment_charge_id,
    channel: row.channel,
    funnelEntry: row.funnel_entry,
    termsVersion: row.terms_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    precheckoutApprovedAt: row.precheckout_approved_at,
    paidAt: row.paid_at,
    failedAt: row.failed_at,
  };
}

function text(value: unknown, name: string, pattern: RegExp) {
  if (typeof value !== "string" || !pattern.test(value)) throw new HttpError(422, "invalid_order", `${name} 格式无效。`);
  return value;
}

function integer(value: unknown, name: string, min: number, max: number) {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) throw new HttpError(422, "invalid_order", `${name} 格式无效。`);
  return Number(value);
}

function iso(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new HttpError(422, "invalid_order", "订单时间格式无效。");
  return new Date(value).toISOString();
}
