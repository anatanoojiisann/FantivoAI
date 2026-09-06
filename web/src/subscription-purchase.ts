import type { InvoiceStatus } from "./telegram";

export type SubscriptionPurchasePhase = "idle" | "creating_invoice" | "awaiting_payment" | "syncing_subscription";
export type SubscriptionPurchaseState = { phase: SubscriptionPurchasePhase; productId: string };
export type SubscriptionPurchaseEvent =
  | { type: "start"; productId: string }
  | { type: "invoice_opened" }
  | { type: "invoice_result"; status: InvoiceStatus }
  | { type: "invoice_error" }
  | { type: "subscription_observed" };

export const IDLE_SUBSCRIPTION_PURCHASE: SubscriptionPurchaseState = { phase: "idle", productId: "" };

export function reduceSubscriptionPurchase(
  state: SubscriptionPurchaseState,
  event: SubscriptionPurchaseEvent,
): SubscriptionPurchaseState {
  if (event.type === "start") {
    return state.phase === "idle" ? { phase: "creating_invoice", productId: event.productId } : state;
  }
  if (event.type === "invoice_error" || event.type === "subscription_observed") return IDLE_SUBSCRIPTION_PURCHASE;
  if (state.phase === "idle") return state;
  if (event.type === "invoice_opened") return { ...state, phase: "awaiting_payment" };
  if (event.status === "cancelled" || event.status === "failed") return IDLE_SUBSCRIPTION_PURCHASE;
  return { ...state, phase: "syncing_subscription" };
}
