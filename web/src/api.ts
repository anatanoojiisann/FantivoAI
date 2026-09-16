import type { CreditPack, SubscriptionPlan, PaymentOrderStatus } from "../../shared/contracts";
import { RequestTimeoutError, withRequestDeadline } from "../../shared/request-deadline";
export type { CreditPack, SubscriptionPlan } from "../../shared/contracts";

export type MiniAppUser = {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  languageCode: string;
};

export type Wallet = { balance: number; version: number };

export type Job = {
  id: string;
  status: string;
  progress: number;
  model: string;
  creditCost: number;
  mode?: "text-to-video" | "image-to-video";
  prompt?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  quality?: string;
  audioEnabled?: boolean;
  providerModel?: string;
  seed?: string | number;
  imageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  completedAt?: string;
  coverUrl?: string;
  thumbnailUrl?: string;
  outputUrl?: string;
  failureCode?: string;
  creditsRefunded?: boolean;
  refundedCredits?: number;
  sourceContentKind?: "template" | "asset";
  sourceContentId?: string;
};

export type Subscription = {
  planId: string;
  status: "active";
  startedAt: string;
  renewedAt: string;
  expiresAt: number;
  isCanceled: boolean;
};

export type Referral = {
  enabled: boolean;
  code: string;
  rewardCredits: number;
  weeklyLimit: number;
  rewardedThisWeek: number;
  remainingRewards: number;
  shareUrl: string;
  records: Array<{
    status: "registered" | "qualified" | "reward_pending" | "rewarded" | "cap_reached";
    registeredAt: string;
    qualifiedAt: string | null;
    rewardedAt: string | null;
    rewardCredits: number;
  }>;
};

export type PaymentOrder = {
  order_id: string;
  order_no: string;
  status: PaymentOrderStatus;
  stars_amount: number;
  credits_amount: number;
  paid_at: string | null;
};

export type HomeItem = {
  id: string;
  kind: "template" | "asset";
  title: string;
  previewUrl?: string;
  videoUrl?: string;
  canMakeSimilar?: boolean;
};

export type Persona = {
  personaCode: string;
  title: string;
  primary: boolean;
};

export type Content = {
  id: string;
  kind: "template" | "asset";
  title: string;
  description?: string;
  previewUrl?: string;
  videoUrl?: string;
  prompt?: string;
  referenceImageUrl?: string;
  promptDisplay?: string;
  defaultReferenceImageUrl?: string;
  defaultReferenceEnabled?: boolean;
  defaultPublicModelId?: string;
  canCreate: boolean;
  requiresImage: boolean;
  requiredImageCount?: number;
  durationSeconds?: number;
  aspectRatio?: string;
};

export type HomeFeed = {
  schemaVersion: number;
  personaCode: string;
  feedSessionId: string;
  rankingVersion: string;
  banners: HomeItem[];
  categories: Array<{ id: string; title: string; itemCount: number }>;
  sections: Array<{ categoryId: string; title: string; items: HomeItem[] }>;
};

export type Bootstrap = {
  user: MiniAppUser;
  wallet: Wallet;
  newUserGift: {
    credits: number;
    grantedNow: boolean;
  };
  referral: Referral;
  jobs: Job[];
  creditPacks: CreditPack[];
  subscriptionPlans: SubscriptionPlan[];
  subscription: Subscription | null;
  subscriptionAvailable: boolean;
  primaryPersonaCode: string;
  personas: Persona[];
  legal: {
    termsVersion: string;
    termsUrl: string;
    privacyUrl: string;
  };
  generation: {
    model: string;
    durationSeconds: number;
    durationOptions: number[];
    aspectRatio: string;
    aspectRatios: string[];
    creditCost: number | null;
    quality: string;
    maxPromptLength: number;
    maxImageBytes: number;
  };
};

export type Publication = {
  id: string;
  jobId: string;
  title: string;
  description: string;
  tags: string[];
  status: string;
  version: number;
};

type JobResult = { job: Job; replayed: boolean };

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
  }
}

export class MiniAppApi {
  constructor(private readonly initData: string, private readonly appSessionId = "", private readonly timeoutMs?: number) {}

  async bootstrap() {
    const value = await this.request<Bootstrap>("/api/bootstrap");
    if (!value.user || !Number.isSafeInteger(value.user.id) || !value.wallet || !Number.isFinite(value.wallet.balance)
      || !value.generation || typeof value.generation.model !== "string"
      || !Array.isArray(value.generation.durationOptions) || !Array.isArray(value.generation.aspectRatios)
      || !Array.isArray(value.jobs) || !Array.isArray(value.personas) || !Array.isArray(value.creditPacks)
      || !Array.isArray(value.subscriptionPlans) || !value.legal || !value.newUserGift || !value.referral) {
      throw new ApiError("invalid_response", "初始化响应不完整。", 200);
    }
    return value;
  }

  home(locale: string, feedSessionId: string, personaCode = "") {
    const query = new URLSearchParams({ locale, feedSessionId });
    if (personaCode) query.set("personaCode", personaCode);
    return this.request<HomeFeed>(`/api/home?${query}`);
  }

  creationTemplates(locale: string, personaCode = "") {
    const query = new URLSearchParams({ locale });
    if (personaCode) query.set("personaCode", personaCode);
    return this.request<{ templates: Content[] }>(`/api/creation-templates?${query}`);
  }

  content(kind: "template" | "asset", contentId: string, locale: string, personaCode = "") {
    const query = new URLSearchParams({ locale });
    if (personaCode) query.set("personaCode", personaCode);
    return this.request<{ content: Content }>(`/api/content/${kind}/${encodeURIComponent(contentId)}?${query}`);
  }

  jobs() {
    return this.request<{ jobs: Job[] }>("/api/jobs");
  }

  createTextJob(prompt: string, durationSeconds: number, aspectRatio: string, requestId: string) {
    return this.request<JobResult>("/api/generation-jobs/text", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      body: JSON.stringify({ prompt, durationSeconds, aspectRatio, requestId }),
    });
  }

  createImageJob(file: File, prompt: string, durationSeconds: number, aspectRatio: string, requestId: string) {
    return this.request<JobResult>("/api/generation-jobs/image", {
      method: "POST",
      headers: {
        "Content-Type": file.type,
        "X-File-Name": encodeURIComponent(file.name),
        "X-Prompt": encodeURIComponent(prompt),
        "X-Duration-Seconds": String(durationSeconds),
        "X-Aspect-Ratio": aspectRatio,
        "X-Request-Id": requestId,
      },
      body: file,
    });
  }

  createContentTextJob(content: Content, prompt: string, durationSeconds: number, aspectRatio: string, requestId: string, personaCode = "") {
    return this.request<JobResult>(`/api/content/${content.kind}/${encodeURIComponent(content.id)}/generation-jobs/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      body: JSON.stringify({ prompt, durationSeconds, aspectRatio, requestId, personaCode }),
    });
  }

  createContentImageJob(content: Content, file: File, prompt: string, durationSeconds: number, aspectRatio: string, requestId: string, personaCode = "") {
    return this.request<JobResult>(`/api/content/${content.kind}/${encodeURIComponent(content.id)}/generation-jobs/image`, {
      method: "POST",
      headers: {
        "Content-Type": file.type,
        "X-File-Name": encodeURIComponent(file.name),
        "X-Prompt": encodeURIComponent(prompt),
        "X-Duration-Seconds": String(durationSeconds),
        "X-Aspect-Ratio": aspectRatio,
        "X-Request-Id": requestId,
        "X-Persona-Code": personaCode,
      },
      body: file,
    });
  }

  createInvoice(productId: string, productType: "credit_pack" | "subscription", termsVersion: string) {
    const path = productType === "credit_pack" ? "/api/payments/telegram-stars/orders" : "/api/payments/invoice";
    return this.request<{ orderId?: string; order_id?: string; invoiceUrl: string; invoice_url?: string }>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, productType, termsVersion }),
    });
  }

  paymentOrder(orderId: string) {
    return this.request<PaymentOrder>(`/api/payments/telegram-stars/orders/${encodeURIComponent(orderId)}`);
  }

  cancelSubscription() {
    return this.request<{ subscription: Subscription }>("/api/subscription/cancel", { method: "POST" });
  }

  resumeSubscription() {
    return this.request<{ subscription: Subscription }>("/api/subscription/resume", { method: "POST" });
  }

  cancelJob(jobId: string) {
    return this.request<{ job: Job }>(`/api/generation-jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
  }

  submitPublication(jobId: string, title: string, description: string, tags: string[], requestId: string) {
    return this.request<{ publication: Publication }>("/api/publications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, title, description, tags, requestId }),
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `tma ${this.initData}`);
    headers.set("Accept", "application/json");
    if (this.appSessionId) headers.set("X-App-Session-Id", this.appSessionId);
    const timeout = this.timeoutMs ?? (init.method === "POST" ? 60_000 : path === "/api/bootstrap" ? 35_000 : 20_000);
    try {
      return await withRequestDeadline(timeout, async (signal) => {
        const response = await fetch(path, { ...init, headers, signal });
        let payload: T & { code?: string; message?: string };
        try {
          payload = await response.json();
        } catch {
          throw new ApiError("invalid_response", "服务返回了无效响应。", response.status);
        }
        if (!payload || typeof payload !== "object") throw new ApiError("invalid_response", "服务返回了无效响应。", response.status);
        if (!response.ok) throw new ApiError(payload.code || "request_failed", payload.message || "请求失败，请稍后重试。", response.status);
        return payload;
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof RequestTimeoutError) throw new ApiError("request_timeout", "请求超时，请重试。", 0);
      throw new ApiError("network_error", "无法连接服务，请检查网络后重试。", 0);
    }
  }
}
