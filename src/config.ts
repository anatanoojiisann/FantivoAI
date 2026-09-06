import type { CreditPack, SubscriptionPlan } from "../shared/contracts";
export type { CreditPack, SubscriptionPlan } from "../shared/contracts";

// 每个 Bot 直接在这里维护自己的商品、售价和品牌文案。
export const BOT_NAME = "Fantivo AI";
export const DEFAULT_DURATION_SECONDS = 5;
// Explicit server-side allowlist for durations users may select in the Mini App.
// Keep this aligned with the active Open Platform model capabilities.
export const DEFAULT_DURATION_OPTIONS = [5, 10] as const;
export const DEFAULT_ASPECT_RATIO = "9:16";
export const DEFAULT_QUALITY = "standard";
export const TERMS_VERSION = "2026-08-04";
export const TERMS_PATH = "/terms";
export const PRIVACY_PATH = "/privacy";
export const TELEGRAM_SUBSCRIPTION_PERIOD_SECONDS = 2_592_000;

export const CREDIT_PACKS: CreditPack[] = [
  { id: "starter", title: "Starter Pack", description: "500 credits", stars: 100, credits: 500 },
  { id: "creator", title: "Creator Pack", description: "1,800 credits", stars: 300, credits: 1800 },
  { id: "studio", title: "Studio Pack", description: "7,000 credits", stars: 1000, credits: 7000 },
];

// Subscription prices are intentionally empty by default. Production plans only
// become purchasable after an administrator publishes an active Stars price.
export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [];
