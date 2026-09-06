import type { Env, OpenPlatformContent, OpenPlatformHome, OpenPlatformJob, OpenPlatformModel, OpenPlatformPersona, TelegramUser } from "./types";
import { DEFAULT_ASPECT_RATIO, DEFAULT_DURATION_SECONDS, DEFAULT_QUALITY, TERMS_VERSION } from "./config";
import { adminSyncConfigured, loadAdminGenerationConfiguration, sendAdminEvent } from "./admin-sync";

type Wallet = { balance: number; version: number };
const CREATION_TEMPLATE_IDS = ["cinematic-portrait", "cover-shot", "couple-story", "city-night", "soft-smile"] as const;

export class OpenPlatformClient {
  constructor(private readonly env: Env) {}

  externalUserId(user: TelegramUser | number) {
    return `telegram_${typeof user === "number" ? user : user.id}`;
  }

  generationConfiguration() {
    return loadAdminGenerationConfiguration(this.env, {
      model: this.env.DEFAULT_MODEL,
      durationSeconds: DEFAULT_DURATION_SECONDS,
      aspectRatio: DEFAULT_ASPECT_RATIO,
      quality: DEFAULT_QUALITY,
      audioEnabled: true,
      maxPromptLength: 1_000,
      maxImageBytes: 10 * 1024 * 1024,
      maxConcurrentJobs: 3,
    });
  }

  async upsertUser(user: TelegramUser, channel: "Bot" | "Mini App" = "Bot") {
    const result = await this.request<{ user: unknown; wallet: Wallet }>("/v1/users", {
      method: "POST",
      body: JSON.stringify({
        externalUserId: this.externalUserId(user),
        displayName: [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Telegram User",
        username: user.username || "",
        languageCode: user.language_code || "",
      }),
    });
    await sendAdminEvent(this.env, {
      eventId: `user:${this.externalUserId(user)}:${result.wallet.version}:${Date.now()}`,
      type: "user.upsert",
      occurredAt: new Date().toISOString(),
      data: { user: adminUser(user), wallet: result.wallet, channel },
    });
    return result;
  }

  async wallet(user: TelegramUser | number) {
    const externalUserId = this.externalUserId(user);
    const result = await this.request<{ wallet: Wallet }>(`/v1/users/${encodeURIComponent(externalUserId)}/wallet`);
    await sendAdminEvent(this.env, {
      eventId: `wallet:${externalUserId}:${result.wallet.version}`,
      type: "wallet.snapshot",
      occurredAt: new Date().toISOString(),
      data: { externalUserId, wallet: result.wallet },
    });
    return result;
  }

  async personas() {
    return this.request<{ primaryPersonaCode: string; personas: OpenPlatformPersona[] }>("/v1/personas");
  }

  async home(locale: string, feedSessionId: string, personaCode = "") {
    const query = new URLSearchParams({ locale, feedSessionId });
    if (personaCode) query.set("personaCode", personaCode);
    return this.request<OpenPlatformHome>(`/v1/home?${query}`);
  }

  async models() {
    return this.request<{ version: string; models: OpenPlatformModel[] }>("/v1/models");
  }

  async content(kind: "template" | "asset", id: string, locale = "", personaCode = "") {
    const params = new URLSearchParams();
    if (locale) params.set("locale", locale);
    if (personaCode) params.set("personaCode", personaCode);
    const query = params.size ? `?${params}` : "";
    return this.request<{ content: OpenPlatformContent }>(`/v1/content/${kind}/${encodeURIComponent(id)}${query}`);
  }

  async creationTemplates(locale = "", personaCode = "") {
    const results = await Promise.allSettled(CREATION_TEMPLATE_IDS.map((id) => this.content("template", id, locale, personaCode)));
    const templates: OpenPlatformContent[] = [];
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const content = result.value.content;
      const requiredImageCount = content.requiredImageCount || (content.requiresImage ? 1 : 0);
      if (content.canCreate && requiredImageCount <= 1) templates.push(content);
    }
    return { templates };
  }

  async recordStarsPayment(input: {
    user: TelegramUser;
    transactionId: string;
    productId: string;
    productTitle?: string;
    stars: number;
    credits: number;
    channel?: "Bot" | "Mini App";
    funnelEntry?: string;
    productType?: "credit_pack" | "subscription";
    isRecurring?: boolean;
    isFirstRecurring?: boolean;
    subscriptionExpirationDate?: number;
    orderId?: string;
    invoicePayload?: string;
    adminSyncRequired?: boolean;
  }) {
    const result = await this.request<{ wallet: Wallet; applied: boolean }>("/v1/payment-events", {
      method: "POST",
      body: JSON.stringify({
        externalUserId: this.externalUserId(input.user),
        provider: "telegram_stars",
        transactionId: input.transactionId,
        productId: input.productId,
        amount: input.stars,
        currency: "XTR",
        credits: input.credits,
      }),
    });
    const adminResult = await sendAdminEvent(this.env, {
      eventId: `payment:${input.transactionId}`,
      type: "payment.credited",
      occurredAt: new Date().toISOString(),
      data: {
        user: adminUser(input.user),
        channel: input.channel || "Bot",
        funnelEntry: input.funnelEntry || (input.channel === "Mini App" ? "wallet" : "buy_command"),
        wallet: result.wallet,
        payment: {
          externalUserId: this.externalUserId(input.user), transactionId: input.transactionId, productId: input.productId,
          productTitle: input.productTitle || input.productId, stars: input.stars, credits: input.credits,
          termsVersion: TERMS_VERSION, applied: result.applied, confirmed: true, productType: input.productType || "credit_pack",
          billingCycle: input.productType === "subscription" ? "subscription" : "one_time",
          isRecurring: input.isRecurring === true, isFirstRecurring: input.isFirstRecurring === true,
          subscriptionExpirationDate: input.subscriptionExpirationDate, orderId: input.orderId, invoicePayload: input.invoicePayload,
        },
      },
    }, input.adminSyncRequired === true);
    return { ...result, adminApplied: adminResult?.applied !== false };
  }

  async setBalance(externalUserId: string, balance: number, referenceId: string) {
    const result = await this.request<{ wallet: Wallet }>(`/v1/users/${encodeURIComponent(externalUserId)}/wallet/balance`, {
      method: "PUT",
      body: JSON.stringify({ balance, reason: "bot_admin_set_balance", referenceId }),
    });
    await sendAdminEvent(this.env, {
      eventId: `wallet:${externalUserId}:${result.wallet.version}`,
      type: "wallet.snapshot",
      occurredAt: new Date().toISOString(),
      data: { externalUserId, wallet: result.wallet },
    });
    return result;
  }

  async upload(user: TelegramUser, fileName: string, contentType: string, body: BodyInit) {
    const query = new URLSearchParams({ externalUserId: this.externalUserId(user), fileName });
    return this.request<{ upload: { id: string; url: string } }>(`/v1/uploads?${query}`, { method: "POST", body, headers: { "Content-Type": contentType } }, false);
  }

  async createJob(input: {
    user: TelegramUser;
    idempotencyKey: string;
    mode: "text-to-video" | "image-to-video";
    prompt: string;
    imageUrl?: string;
    durationSeconds?: number;
    aspectRatio?: string;
  }) {
    const generation = await this.generationConfiguration();
    const durationSeconds = input.durationSeconds ?? generation.durationSeconds;
    const aspectRatio = input.aspectRatio || generation.aspectRatio;
    const result = await this.request<{ job: OpenPlatformJob; replayed: boolean }>("/v1/generation-jobs", {
      method: "POST",
      headers: { "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({
        externalUserId: this.externalUserId(input.user),
        idempotencyKey: input.idempotencyKey,
        mode: input.mode,
        prompt: input.prompt,
        imageUrl: input.imageUrl || "",
        model: generation.model,
        durationSeconds,
        aspectRatio,
        quality: generation.quality,
        audioEnabled: generation.audioEnabled,
        ...generationCallback(this.env),
      }),
    });
    if (adminSyncConfigured(this.env)) {
      try {
        const { wallet } = await this.request<{ wallet: Wallet }>(`/v1/users/${encodeURIComponent(this.externalUserId(input.user))}/wallet`);
        await sendAdminEvent(this.env, {
          eventId: `job:${result.job.id}:created`,
          type: "job.upsert",
          occurredAt: new Date().toISOString(),
          data: {
            applied: !result.replayed,
            channel: input.idempotencyKey.startsWith("telegram-mini-app-") ? "Mini App" : "Bot",
            wallet,
            job: {
              mode: input.mode, prompt: input.prompt, imageUrl: input.imageUrl, idempotencyKey: input.idempotencyKey,
              durationSeconds, aspectRatio, quality: generation.quality,
              audioEnabled: generation.audioEnabled, createdAt: new Date().toISOString(), ...result.job,
            },
          },
        });
      } catch (error) {
        console.error(JSON.stringify({ event: "admin_job_sync_failed", jobId: result.job.id, error: String(error) }));
      }
    }
    return result;
  }

  async createFromTemplate(input: { user: TelegramUser; idempotencyKey: string; templateId: string; personaCode?: string; userPrompt?: string; imageUrl?: string; durationSeconds?: number; aspectRatio?: string }) {
    return this.createFromContent("template", input.templateId, input);
  }

  async followAsset(input: { user: TelegramUser; idempotencyKey: string; assetId: string; personaCode?: string; userPrompt?: string; imageUrl: string; durationSeconds?: number; aspectRatio?: string }) {
    return this.createFromContent("asset", input.assetId, input);
  }

  private async createFromContent(kind: "template" | "asset", contentId: string, input: {
    user: TelegramUser;
    idempotencyKey: string;
    personaCode?: string;
    userPrompt?: string;
    imageUrl?: string;
    durationSeconds?: number;
    aspectRatio?: string;
  }) {
    const requestKey = input.idempotencyKey;
    const generation = await this.generationConfiguration();
    const durationSeconds = input.durationSeconds ?? generation.durationSeconds;
    const aspectRatio = input.aspectRatio || generation.aspectRatio;
    const result = await this.request<{ job: OpenPlatformJob; replayed: boolean }>(`/v1/${kind === "template" ? "templates" : "assets"}/${encodeURIComponent(contentId)}/generation-jobs`, {
      method: "POST",
      headers: { "Idempotency-Key": requestKey },
      body: JSON.stringify({
        personaCode: input.personaCode || "",
        externalUserId: this.externalUserId(input.user),
        idempotencyKey: requestKey,
        userPrompt: input.userPrompt || "",
        imageUrl: input.imageUrl || "",
        model: generation.model,
        durationSeconds,
        aspectRatio,
        quality: generation.quality,
        audioEnabled: generation.audioEnabled,
        ...generationCallback(this.env),
      }),
    });
    if (adminSyncConfigured(this.env)) {
      try {
        const { wallet } = await this.request<{ wallet: Wallet }>(`/v1/users/${encodeURIComponent(this.externalUserId(input.user))}/wallet`);
        await sendAdminEvent(this.env, {
          eventId: `job:${result.job.id}:created`,
          type: "job.upsert",
          occurredAt: new Date().toISOString(),
          data: {
            applied: !result.replayed,
            channel: requestKey.startsWith("telegram-mini-app-") ? "Mini App" : "Bot",
            wallet,
            job: {
              mode: input.imageUrl ? "image-to-video" : "text-to-video",
              prompt: input.userPrompt || "",
              imageUrl: input.imageUrl,
              idempotencyKey: requestKey,
              sourceContentKind: kind,
              sourceContentId: contentId,
              durationSeconds,
              aspectRatio,
              quality: generation.quality,
              audioEnabled: generation.audioEnabled,
              createdAt: new Date().toISOString(),
              ...result.job,
            },
          },
        });
      } catch (error) {
        console.error(JSON.stringify({ event: "admin_content_job_sync_failed", jobId: result.job.id, error: String(error) }));
      }
    }
    return result;
  }

  async jobs(user: TelegramUser | number) {
    const query = new URLSearchParams({ externalUserId: this.externalUserId(user), limit: "10" });
    const result = await this.request<{ jobs: OpenPlatformJob[] }>(`/v1/generation-jobs?${query}`);
    await sendAdminEvent(this.env, {
      eventId: `jobs_snapshot:${this.externalUserId(user)}:${Date.now()}`,
      type: "jobs.snapshot",
      occurredAt: new Date().toISOString(),
      data: { jobs: result.jobs },
    });
    return result;
  }

  async job(jobId: string) {
    return this.request<{ job: OpenPlatformJob }>(`/v1/generation-jobs/${encodeURIComponent(jobId)}`);
  }

  async cancel(jobId: string, user: TelegramUser | number, channel: "Bot" | "Mini App" = "Bot") {
    const current = await this.job(jobId);
    if (current.job.externalUserId !== this.externalUserId(user)) {
      throw new OpenPlatformError("not_found", "job not found", 404);
    }
    const result = await this.request<{ job: OpenPlatformJob }>(`/v1/generation-jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST", body: "{}" });
    if (adminSyncConfigured(this.env)) {
      try {
        const { wallet } = await this.request<{ wallet: Wallet }>(`/v1/users/${encodeURIComponent(this.externalUserId(user))}/wallet`);
        await sendAdminEvent(this.env, {
          eventId: `job:${result.job.id}:cancelled:${wallet.version}`,
          type: "job.upsert",
          occurredAt: new Date().toISOString(),
          data: { channel, wallet, job: result.job },
        });
      } catch (error) {
        console.error(JSON.stringify({ event: "admin_cancel_sync_failed", jobId: result.job.id, error: String(error) }));
      }
    }
    return result;
  }

  private async request<T>(path: string, init: RequestInit = {}, json = true): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.env.OPEN_PLATFORM_API_KEY}`);
    if (json) headers.set("Content-Type", "application/json");
    const method = (init.method || "GET").toUpperCase();
    const canRetry = method === "GET" || headers.has("Idempotency-Key");
    const endpoint = logEndpoint(path);

    for (let attempt = 1; attempt <= (canRetry ? 2 : 1); attempt += 1) {
      let response: Response;
      try {
        response = await fetch(`${this.env.OPEN_PLATFORM_BASE_URL.replace(/\/$/, "")}${path}`, { ...init, headers });
      } catch (error) {
        console.error(JSON.stringify({ event: "open_platform_request_failed", endpoint, method, code: "network_error", status: 0, attempt }));
        if (canRetry && attempt === 1) {
          await retryDelay();
          continue;
        }
        throw error;
      }
      if (response.ok) return response.json() as Promise<T>;

      const error = await response.json().catch(() => ({ code: "request_failed", message: response.statusText })) as { code?: string; message?: string };
      const code = error.code || "request_failed";
      console.error(JSON.stringify({ event: "open_platform_request_failed", endpoint, method, code, status: response.status, attempt }));
      if (canRetry && attempt === 1 && [502, 503, 504].includes(response.status)) {
        await retryDelay();
        continue;
      }
      throw new OpenPlatformError(code, error.message || response.statusText, response.status);
    }
    throw new OpenPlatformError("request_failed", "Open Platform request failed", 502);
  }
}

function logEndpoint(path: string) {
  return path.split("?", 1)[0]
    .replace(/\/v1\/users\/[^/]+/g, "/v1/users/:externalUserId")
    .replace(/\/v1\/generation-jobs\/[^/]+/g, "/v1/generation-jobs/:jobId");
}

function retryDelay() {
  return new Promise((resolve) => setTimeout(resolve, 250));
}

function generationCallback(env: Env) {
  const configured = env.OPEN_PLATFORM_CALLBACK_URL?.trim();
  if (!configured) return {};
  try {
    const url = new URL(configured);
    if (url.protocol === "https:") return { callbackUrl: url.toString() };
  } catch {
    // Invalid optional configuration is ignored so generation can continue via polling.
  }
  console.error(JSON.stringify({ event: "invalid_open_platform_callback_url" }));
  return {};
}

function adminUser(user: TelegramUser) {
  return {
    externalUserId: `telegram_${user.id}`,
    telegramId: user.id,
    displayName: [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Telegram User",
    username: user.username || "",
    languageCode: user.language_code || "",
  };
}

export class OpenPlatformError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
  }
}
