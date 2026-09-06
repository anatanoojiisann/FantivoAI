import type { CreditPack as OrderProduct } from "../shared/contracts";
export type { CreditPack as OrderProduct } from "../shared/contracts";

import { TERMS_VERSION } from "./config";
import { createAdminPaymentOrder, markAdminPaymentOrderFailed, type PaymentOrder } from "./admin-sync";
import { orderInvoicePayload } from "./payment";
import { TelegramClient } from "./telegram";
import type { Env, TelegramUser } from "./types";

export async function createTelegramStarsOrder(
  env: Env,
  user: TelegramUser,
  product: OrderProduct,
  channel: "Bot" | "Mini App",
  funnelEntry: string,
) {
  const id = `ord_${crypto.randomUUID()}`;
  const orderNo = `FTV-${Date.now().toString(36).toUpperCase()}-${id.slice(-8).toUpperCase()}`;
  const createdAt = new Date().toISOString();
  const invoicePayload = orderInvoicePayload(id);
  const order = await createAdminPaymentOrder(env, {
    id,
    orderNo,
    externalUserId: `telegram_${user.id}`,
    telegramUserId: user.id,
    productId: product.id,
    productTitle: product.title,
    productType: "credit_pack",
    starsAmount: product.stars,
    creditsAmount: product.credits,
    invoicePayload,
    channel,
    funnelEntry,
    termsVersion: TERMS_VERSION,
    createdAt,
  });

  try {
    const invoiceUrl = await new TelegramClient(env).createInvoice({
      title: product.title,
      description: product.description,
      payload: order.invoicePayload,
      stars: order.starsAmount,
    });
    console.log(JSON.stringify({
      event: "telegram_stars_order_created",
      orderId: order.id,
      orderNo: order.orderNo,
      telegramUserId: order.telegramUserId,
      paymentStatus: order.status,
      starsAmount: order.starsAmount,
      creditsAmount: order.creditsAmount,
    }));
    return { order, invoiceUrl };
  } catch (error) {
    await markAdminPaymentOrderFailed(env, order.id).catch(() => undefined);
    console.error(JSON.stringify({ event: "telegram_stars_invoice_creation_failed", orderId: order.id, orderNo: order.orderNo, error: String(error) }));
    throw error;
  }
}

export function orderMatchesProduct(order: PaymentOrder, product: OrderProduct | undefined) {
  return Boolean(product && order.productType === "credit_pack" && product.id === order.productId
    && product.stars === order.starsAmount && product.credits === order.creditsAmount);
}
