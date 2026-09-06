import { demoData } from "./mock-data";
import type { AdminData, AdminUser, AffiliateAnalytics, AnalyticsAiAnalysis, ConfigurationState, CreditPack, GenerationConfiguration, MiniAppAnalytics, ModelCatalog, SubscriptionPlan, UserAcquisition } from "./types";

export type ReferralConfiguration = ConfigurationState["referral"];

export interface AdminRepository {
  load(): Promise<AdminData>;
  session(): Promise<{ authenticated: boolean; totpRequired: boolean }>;
  login(username: string, password: string, totp: string): Promise<void>;
  logout(): Promise<void>;
  adjustWallet(externalUserId: string, delta: number, reason: string, referenceId: string): Promise<AdminUser>;
  publishConfiguration(generation: GenerationConfiguration, creditPacks: CreditPack[], subscriptionPlans: SubscriptionPlan[], newUserGiftCredits: number, referral: ReferralConfiguration): Promise<ConfigurationState>;
  loadModelCatalog(sync?: boolean): Promise<ModelCatalog>;
  loadMiniAppAnalytics(from?: string, to?: string): Promise<MiniAppAnalytics>;
  analyzeMiniAppAnalytics(question: string, from: string, to: string): Promise<AnalyticsAiAnalysis>;
  loadUserAcquisition(externalUserId: string): Promise<UserAcquisition>;
  loadAffiliateAnalytics(from?: string, to?: string): Promise<AffiliateAnalytics>;
  syncTelegramStars(): Promise<{ fetched: number; inserted: number; pages: number; completedAt: string }>;
}

class DemoAdminRepository implements AdminRepository {
  private data = structuredClone(demoData);

  async load() {
    return this.data;
  }

  async session() { return { authenticated: true, totpRequired: false }; }

  async login() {}

  async logout() {}

  async adjustWallet(externalUserId: string, delta: number, reason: string, referenceId: string) {
    const user = this.data.users.find((item) => item.externalUserId === externalUserId);
    if (!user) throw new Error("没有找到用户。");
    const before = user.balance;
    const after = before + delta;
    if (after < 0) throw new Error("调整后的余额不能小于 0。");
    user.balance = after;
    user.walletVersion += 1;
    user.manualCredits += delta;
    this.data.walletEntries.unshift({
      id: `wal_demo_${Date.now().toString(36)}`,
      externalUserId,
      userName: user.displayName,
      type: "manual_adjustment",
      delta,
      balanceBefore: before,
      balanceAfter: after,
      referenceId,
      reason,
      createdAt: new Date().toISOString(),
    });
    return user;
  }

  async publishConfiguration(generation: GenerationConfiguration, creditPacks: CreditPack[], subscriptionPlans: SubscriptionPlan[], newUserGiftCredits: number, referral: ReferralConfiguration) {
    this.data.creditPacks = structuredClone(creditPacks);
    this.data.subscriptionPlans = structuredClone(subscriptionPlans);
    this.data.configuration = {
      version: `demo.${Date.now()}`,
      status: "active",
      publishedAt: new Date().toISOString(),
      generation,
      newUserGift: {
        credits: newUserGiftCredits,
        enabledAt: newUserGiftCredits > 0 ? this.data.configuration.newUserGift.enabledAt || new Date().toISOString() : null,
      },
      referral,
    };
    return this.data.configuration;
  }

  async loadModelCatalog(): Promise<ModelCatalog> {
    return {
      status: "ready", version: "preview-models-v1", syncedAt: new Date().toISOString(), responseTimeMs: 22,
      models: [{ id: "peach-max", name: "Peach Max", creditCost: 60, modes: ["text-to-video", "image-to-video"], durations: [5, 10], aspectRatios: ["9:16", "16:9", "1:1"], qualities: ["standard"], supportsAudio: true, enabled: true }],
    };
  }

  async loadMiniAppAnalytics(): Promise<MiniAppAnalytics> {
    return {
      configured: true, status: "ready", from: "2026-07-30", to: "2026-08-05", fetchedAt: new Date().toISOString(), responseTimeMs: 42,
      totals: { mini_app_opened: 842, personalized_feed_loaded: 774, personalized_feed_failed: 11, home_item_impression: 5_210, home_item_clicked: 618, generation_submitted: 196, generation_created: 181, generation_failed: 15, wallet_opened: 122, credit_pack_selected: 74, invoice_opened: 68, payment_result_received: 51, payment_paid: 51, job_cancelled: 6 },
      distributions: { locales: [{ value: "zh-CN", count: 402 }, { value: "en", count: 238 }], personas: [{ value: "creator", count: 774 }], rankings: [{ value: "seeded-shuffle-v1", count: 774 }], modes: [{ value: "text", count: 121 }, { value: "image", count: 75 }], acquisitionSources: [{ value: "xhs", count: 118 }, { value: "telegram_organic", count: 92 }], acquisitionCampaigns: [{ value: "summer_2026", count: 81 }], acquisitionContent: [{ value: "creator-01", count: 36 }] },
    };
  }

  async analyzeMiniAppAnalytics(_question: string, from: string, to: string): Promise<AnalyticsAiAnalysis> {
    return { configured: true, status: "ready", from, to, generatedAt: new Date().toISOString(), model: "demo-gpt", answer: "小红书是当前最大的已标记新用户来源，共 118 人；上线初期仍有部分来源未归因，建议继续统一投放链接。", toolsUsed: [{ name: "get_acquisition_breakdown", arguments: { from, to, group_by: "source" } }] };
  }

  async loadUserAcquisition(externalUserId: string): Promise<UserAcquisition> {
    return { found: true, externalUserId, source: "xhs", medium: "telegram_deep_link", campaign: "summer_2026", content: "creator-01", startParam: "acq--xhs--summer_2026--creator-01", firstSeenAt: "2026-08-01T04:12:00Z" };
  }

  async loadAffiliateAnalytics(): Promise<AffiliateAnalytics> {
    return {
      status: "ready",
      from: "2026-07-11", to: "2026-08-09", generatedAt: new Date().toISOString(),
      metrics: { totalStarsOrders: 51, affiliateOrders: 12, affiliatePaidUsers: 9, affiliateGrossStarsRevenue: 3_600, affiliateCommissionStars: 540, telegramCreditedStars: 3_060, nonAffiliateStarsRevenue: 8_400 },
      affiliates: [{ type: "user", peerId: "123456", name: "@creator", paidUsers: 9, paidOrders: 12, grossStars: 3_600, commissionStars: 540, telegramCreditedStars: 3_060 }],
      sync: { lastStartedAt: new Date().toISOString(), lastCompletedAt: new Date().toISOString(), lastError: null, lastInserted: 3 },
    };
  }

  async syncTelegramStars() {
    return { fetched: 0, inserted: 0, pages: 1, completedAt: new Date().toISOString() };
  }
}

class RemoteAdminRepository implements AdminRepository {
  constructor(private readonly baseUrl: string) {}

  async load(): Promise<AdminData> {
    const response = await this.request<AdminData>("/admin/v1/bootstrap");
    response.mode = "remote";
    return response;
  }

  async session() {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/auth/v1/session`, { credentials: "include", headers: { "Accept": "application/json" } });
    if (!response.ok) throw await responseError(response);
    const value = await response.json() as { authenticated?: boolean; totpRequired?: boolean };
    return { authenticated: value.authenticated === true, totpRequired: value.totpRequired !== false };
  }

  async login(username: string, password: string, totp: string) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/auth/v1/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, totp }),
    });
    if (!response.ok) throw await responseError(response);
  }

  async logout() {
    await this.request<{ authenticated: false }>("/auth/v1/logout", { method: "POST" });
  }

  async adjustWallet(externalUserId: string, delta: number, reason: string, referenceId: string) {
    return this.request<{ user: AdminUser }>(`/admin/v1/users/${encodeURIComponent(externalUserId)}/wallet-adjustments`, {
      method: "POST",
      body: JSON.stringify({ delta, reason, referenceId }),
    }).then((value) => value.user);
  }

  async publishConfiguration(generation: GenerationConfiguration, creditPacks: CreditPack[], subscriptionPlans: SubscriptionPlan[], newUserGiftCredits: number, referral: ReferralConfiguration) {
    return this.request<{ configuration: ConfigurationState }>("/admin/v1/configuration-versions", {
      method: "POST",
      body: JSON.stringify({ generation, creditPacks, subscriptionPlans, newUserGiftCredits, referral }),
    }).then((value) => value.configuration);
  }

  async loadModelCatalog(sync = false) {
    return this.request<ModelCatalog>(sync ? "/admin/v1/model-catalog/sync" : "/admin/v1/model-catalog", sync ? { method: "POST" } : undefined);
  }

  async loadMiniAppAnalytics(from?: string, to?: string) {
    const query = new URLSearchParams();
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    return this.request<MiniAppAnalytics>(`/admin/v1/analytics/mini-app${query.size ? `?${query}` : ""}`);
  }

  async analyzeMiniAppAnalytics(question: string, from: string, to: string) {
    return this.request<AnalyticsAiAnalysis>("/admin/v1/analytics/mini-app/analyze", {
      method: "POST",
      body: JSON.stringify({ question, from, to }),
    });
  }

  async loadUserAcquisition(externalUserId: string) {
    return this.request<UserAcquisition>(`/admin/v1/analytics/mini-app/users/${encodeURIComponent(externalUserId)}/acquisition`);
  }

  async loadAffiliateAnalytics(from?: string, to?: string) {
    const query = new URLSearchParams();
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    return this.request<AffiliateAnalytics>(`/admin/v1/analytics/telegram-affiliate${query.size ? `?${query}` : ""}`);
  }

  async syncTelegramStars() {
    return this.request<{ sync: { fetched: number; inserted: number; pages: number; completedAt: string } }>("/admin/v1/telegram-stars/sync", { method: "POST" }).then((value) => value.sync);
  }

  private async request<T>(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body) headers.set("Content-Type", "application/json");
    if (init.method && !["GET", "HEAD"].includes(init.method.toUpperCase())) {
      const csrf = readCookie("aurax_admin_csrf");
      if (csrf) headers.set("X-CSRF-Token", csrf);
    }
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, { ...init, headers, credentials: "include" });
    if (!response.ok) throw await responseError(response);
    return response.json() as Promise<T>;
  }
}

export class AuthenticationRequiredError extends Error {}

async function responseError(response: Response) {
  const problem = await response.json().catch(() => ({ message: response.statusText, code: "" })) as { message?: string; code?: string };
  if (response.status === 401 && problem.code === "authentication_required") return new AuthenticationRequiredError(problem.message || "请先登录后台。");
  return new Error(problem.message || "后台接口请求失败。");
}

function readCookie(name: string) {
  for (const item of document.cookie.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return parts.join("=");
  }
  return "";
}

export function createAdminRepository(): AdminRepository {
  if (import.meta.env.VITE_ADMIN_DEMO_MODE === "true") return new DemoAdminRepository();
  const baseUrl = import.meta.env.VITE_ADMIN_API_BASE_URL?.trim();
  return new RemoteAdminRepository(baseUrl || "/api");
}
