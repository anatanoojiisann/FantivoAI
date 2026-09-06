import { TERMS_VERSION } from "./config";

export type InvoicePayload = {
  productId?: string;
  externalUserId?: string;
  orderId?: string;
  termsVersion: string;
  productType: "credit_pack" | "subscription";
  channel?: "Bot" | "Mini App";
  funnelEntry?: string;
};

export function orderInvoicePayload(orderId: string, termsVersion = TERMS_VERSION) {
  if (!/^ord_[a-f0-9-]{32,48}$/i.test(orderId)) throw new Error("Invalid payment order id");
  return `v5|${termsVersion}|${orderId}`;
}

export function invoicePayload(productId: string, externalUserId: string, termsVersion = TERMS_VERSION, channel?: "Bot" | "Mini App", funnelEntry?: string, productType: "credit_pack" | "subscription" = "credit_pack") {
  if (productType === "subscription") {
    if (!channel) throw new Error("Subscription invoices require a channel");
    return `v4|${termsVersion}|subscription|${productId}|${externalUserId}|${channel === "Mini App" ? "mini_app" : "bot"}|${funnelEntry || "subscription"}`;
  }
  if (channel) return `v3|${termsVersion}|${productId}|${externalUserId}|${channel === "Mini App" ? "mini_app" : "bot"}|${funnelEntry || (channel === "Mini App" ? "wallet" : "buy_command")}`;
  return `v2|${termsVersion}|${productId}|${externalUserId}`;
}

export function parseInvoicePayload(value: string): InvoicePayload | null {
  const subscription = value.split("|");
  if (subscription[0] === "v5") {
    const [version, termsVersion, orderId, extra] = subscription;
    if (version !== "v5" || termsVersion !== TERMS_VERSION || !orderId || extra || !/^ord_[a-f0-9-]{32,48}$/i.test(orderId)) return null;
    return { orderId, termsVersion, productType: "credit_pack" };
  }
  if (subscription[0] === "v4") {
    const [version, termsVersion, productType, productId, externalUserId, channel, funnelEntry, extra] = subscription;
    if (version !== "v4" || termsVersion !== TERMS_VERSION || productType !== "subscription" || !productId || !externalUserId || extra) return null;
    if ((channel !== "bot" && channel !== "mini_app") || !funnelEntry || !/^[a-z0-9_-]{2,40}$/.test(funnelEntry)) return null;
    return { productId, externalUserId, termsVersion, productType: "subscription", channel: channel === "mini_app" ? "Mini App" : "Bot", funnelEntry };
  }
  const [version, termsVersion, productId, externalUserId, channel, funnelEntry, extra] = value.split("|");
  if (termsVersion !== TERMS_VERSION || !productId || !externalUserId || extra) return null;
  if (version === "v3") {
    if ((channel !== "bot" && channel !== "mini_app") || !funnelEntry || !/^[a-z0-9_-]{2,40}$/.test(funnelEntry)) return null;
    return { productId, externalUserId, termsVersion, productType: "credit_pack", channel: channel === "mini_app" ? "Mini App" : "Bot", funnelEntry };
  }
  if (version !== "v2" || channel || funnelEntry) return null;
  return { productId, externalUserId, termsVersion, productType: "credit_pack" };
}
