import type { CreditPackConfiguration as CreditPack, SubscriptionPlanConfiguration as SubscriptionPlan } from "../../shared/contracts";
export type { CreditPackConfiguration as CreditPack, SubscriptionPlanConfiguration as SubscriptionPlan } from "../../shared/contracts";

export type PageId =
  | "overview"
  | "users"
  | "jobs"
  | "payments"
  | "affiliates"
  | "configuration"
  | "generation"
  | "analytics"
  | "monitoring";

export type Metric = {
  id: string;
  label: string;
  value: string;
  change: number;
  hint: string;
  tone?: "default" | "success" | "warning" | "danger";
};

export type TrendPoint = {
  label: string;
  jobs: number;
  revenue: number;
  successRate: number;
};

export type UserStatus = "active" | "generation_restricted" | "disabled";

export type AdminUser = {
  externalUserId: string;
  telegramId: number;
  displayName: string;
  username: string;
  languageCode: string;
  status: UserStatus;
  balance: number;
  walletVersion: number;
  paidStars: number;
  purchasedCredits: number;
  consumedCredits: number;
  refundedCredits: number;
  manualCredits: number;
  jobs: number;
  successRate: number;
  joinedAt: string;
  lastActiveAt: string;
  firstChannel: "Bot" | "Mini App";
  miniAppJobs?: number;
  lastMiniAppActivityAt?: string;
};

export type JobStatus = "queued" | "processing" | "succeeded" | "failed" | "cancelled";

export type AdminJob = {
  id: string;
  externalUserId: string;
  userName: string;
  mode: "text-to-video" | "image-to-video";
  prompt: string;
  model: string;
  status: JobStatus;
  progress: number;
  creditCost: number;
  refundedCredits: number;
  channel: "Bot" | "Mini App";
  durationSeconds: number;
  aspectRatio: string;
  quality: string;
  audioEnabled: boolean;
  imageUrl?: string;
  outputUrl?: string;
  failureCode?: string;
  failureMessage?: string;
  idempotencyKey: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  callbackAttempts: number;
  callbackStatus?: number;
  botNotificationStatus: "pending" | "sent" | "failed";
};

export type PaymentStatus = "credited" | "refunding" | "refunded" | "exception";
export type ReconciliationStatus = "matched" | "unmatched" | "duplicated" | "amount_mismatch";

export type Payment = {
  id: string;
  telegramChargeId: string;
  externalUserId: string;
  userName: string;
  productId: string;
  productTitle: string;
  stars: number;
  credits: number;
  status: PaymentStatus;
  applied: boolean;
  termsVersion: string;
  reconciliation: ReconciliationStatus;
  paidAt: string;
  creditedAt?: string;
  walletEntryId?: string;
  channel?: "Bot" | "Mini App";
  funnelEntry?: string;
  productType?: "credit_pack" | "subscription";
  billingCycle?: "one_time" | "subscription";
  isRecurring?: boolean;
  isFirstRecurring?: boolean;
  subscriptionExpirationDate?: number;
};

export type WalletEntry = {
  id: string;
  externalUserId: string;
  userName: string;
  type: "payment" | "generation" | "refund" | "gift" | "manual_adjustment";
  delta: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceId: string;
  reason: string;
  createdAt: string;
};

export type ServiceHealth = {
  id: string;
  name: string;
  description: string;
  status: "healthy" | "degraded" | "down";
  successRate: number;
  p95: number;
  requests: number;
  lastSuccessAt: string;
  lastFailureAt?: string;
  lastError?: string;
};

export type GenerationConfiguration = {
  model: string;
  durationSeconds: number;
  aspectRatio: string;
  quality: string;
  maxPromptLength: number;
  maxImageBytes: number;
  maxConcurrentJobs: number;
  audioEnabled: boolean;
};

export type ModelCatalogItem = {
  id: string;
  name: string;
  creditCost: number;
  modes: Array<"text-to-video" | "image-to-video">;
  durations: number[];
  aspectRatios: string[];
  qualities: string[];
  supportsAudio: boolean;
  enabled: boolean;
};

export type ModelCatalog = {
  status: "ready";
  version: string;
  syncedAt: string;
  responseTimeMs: number;
  models: ModelCatalogItem[];
};

export type MiniAppAnalytics = {
  configured: boolean;
  status: "ready" | "not_configured" | "error";
  from: string;
  to: string;
  fetchedAt: string;
  responseTimeMs: number;
  error?: string;
  totals: Record<string, number>;
  distributions: {
    locales: Array<{ value: string; count: number }>;
    personas: Array<{ value: string; count: number }>;
    rankings: Array<{ value: string; count: number }>;
    modes: Array<{ value: string; count: number }>;
    acquisitionSources: Array<{ value: string; count: number }>;
    acquisitionCampaigns: Array<{ value: string; count: number }>;
    acquisitionContent: Array<{ value: string; count: number }>;
  };
};

export type UserAcquisition = {
  found: boolean;
  externalUserId: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  startParam: string;
  firstSeenAt: string | null;
};

export type AnalyticsAiAnalysis = {
  configured: boolean;
  status: "ready" | "not_configured";
  missing?: string[];
  answer?: string;
  model?: string;
  from: string;
  to: string;
  generatedAt: string;
  toolsUsed?: Array<{ name: string; arguments: Record<string, unknown> }>;
};

export type AffiliateAnalytics = {
  status: "ready";
  from: string;
  to: string;
  generatedAt: string;
  metrics: {
    totalStarsOrders: number;
    affiliateOrders: number;
    affiliatePaidUsers: number;
    affiliateGrossStarsRevenue: number;
    affiliateCommissionStars: number;
    telegramCreditedStars: number;
    nonAffiliateStarsRevenue: number;
  };
  affiliates: Array<{
    type: "user" | "chat";
    peerId: string;
    name: string;
    paidUsers: number;
    paidOrders: number;
    grossStars: number;
    commissionStars: number;
    telegramCreditedStars: number;
  }>;
  sync: {
    lastStartedAt: string | null;
    lastCompletedAt: string | null;
    lastError: string | null;
    lastInserted: number;
  };
};

export type IntegrationState<T> =
  | { status: "idle" | "loading" }
  | { status: "error"; error: string }
  | T;

export type ConfigurationState = {
  version: string;
  status: string;
  publishedAt?: string | null;
  generation: GenerationConfiguration;
  newUserGift: {
    credits: number;
    enabledAt: string | null;
  };
  referral: {
    enabled: boolean;
    rewardCredits: number;
    weeklyLimit: number;
  };
};

export type AdminData = {
  mode: "demo" | "remote";
  environment: "demo" | "development" | "production";
  metrics: Metric[];
  trends: TrendPoint[];
  users: AdminUser[];
  jobs: AdminJob[];
  payments: Payment[];
  walletEntries: WalletEntry[];
  creditPacks: CreditPack[];
  subscriptionPlans: SubscriptionPlan[];
  configuration: ConfigurationState;
  services: ServiceHealth[];
};
