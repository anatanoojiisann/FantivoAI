// Shared wire contracts. Keep this module free of runtime code and environment bindings.

export type CreditPack = {
  id: string;
  title: string;
  description: string;
  stars: number;
  credits: number;
};

export type SubscriptionPlan = {
  id: string;
  title: string;
  description: string;
  stars: number;
  creditsPerCycle: number;
  periodSeconds: number;
  recommended: boolean;
};

export type PaymentOrderStatus = "PENDING" | "PRECHECKOUT_APPROVED" | "PAID" | "FAILED";

export type PaymentOrder = {
  id: string;
  orderNo: string;
  externalUserId: string;
  telegramUserId: number;
  productId: string;
  productTitle: string;
  productType: "credit_pack" | "subscription";
  starsAmount: number;
  creditsAmount: number;
  invoicePayload: string;
  status: PaymentOrderStatus;
  telegramPaymentChargeId: string | null;
  channel: "Bot" | "Mini App";
  funnelEntry: string;
  termsVersion: string;
  createdAt: string;
  updatedAt: string;
  precheckoutApprovedAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
};

export type CreditPackConfiguration = {
  id: string;
  title: string;
  description: string;
  stars: number;
  baseCredits: number;
  bonusCredits: number;
  status: "active" | "draft" | "inactive";
  recommended: boolean;
  channels: Array<"Bot" | "Mini App">;
  termsVersion: string;
};

export type SubscriptionPlanConfiguration = {
  id: string;
  title: string;
  description: string;
  stars: number;
  creditsPerCycle: number;
  periodSeconds: 2592000;
  status: "active" | "draft" | "inactive";
  recommended: boolean;
  channels: Array<"Bot" | "Mini App">;
  termsVersion: string;
};
