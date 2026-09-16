import type { PaymentOrder, CreditPack as RuntimeCreditPack, SubscriptionPlan as RuntimeSubscriptionPlan } from "../shared/contracts";
export type { PaymentOrder, CreditPack as RuntimeCreditPack, SubscriptionPlan as RuntimeSubscriptionPlan } from "../shared/contracts";

import type { Env } from "./types";
import { withRequestDeadline } from "../shared/request-deadline";

export type AdminEvent = {
  eventId: string;
  type: "user.upsert" | "wallet.snapshot" | "payment.credited" | "job.upsert" | "jobs.snapshot" | "publication.submitted" | "service.health";
  occurredAt: string;
  data: Record<string, unknown>;
};

export type RuntimeGenerationConfiguration = {
  model: string;
  durationSeconds: number;
  aspectRatio: string;
  quality: string;
  audioEnabled: boolean;
  maxPromptLength: number;
  maxImageBytes: number;
  maxConcurrentJobs: number;
};

type AdminConfigurationPayload = {
  generation?: Partial<RuntimeGenerationConfiguration>;
  creditPacks?: unknown;
  subscriptionPlans?: unknown;
  newUserGift?: { credits?: unknown; enabledAt?: unknown };
};

export type NewUserGiftClaim = {
  eligible: boolean;
  applied: boolean;
  credits: number;
  wallet?: { balance: number; version: number };
};

export type ReferralOverview = {
  enabled: boolean;
  code: string;
  rewardCredits: number;
  weeklyLimit: number;
  rewardedThisWeek: number;
  remainingRewards: number;
  records: Array<{
    status: "registered" | "qualified" | "reward_pending" | "rewarded" | "cap_reached";
    registeredAt: string;
    qualifiedAt: string | null;
    rewardedAt: string | null;
    rewardCredits: number;
  }>;
};

let cachedConfiguration: { key: object | string; value: AdminConfigurationPayload; expiresAt: number } | undefined;
const pendingConfigurations = new Map<object | string, Promise<AdminConfigurationPayload | null>>();

export function adminSyncConfigured(env: Env) {
  return Boolean((env.ADMIN_SERVICE || env.ADMIN_SYNC_BASE_URL?.trim()) && env.ADMIN_SYNC_SECRET?.trim());
}

export async function sendAdminEvent(env: Env, event: AdminEvent, required = false) {
  if (!adminSyncConfigured(env)) {
    if (required) throw new AdminSyncError("发布服务尚未配置，请稍后再试。");
    return null;
  }
  try {
    const bodyText = JSON.stringify(event);
    const body = new TextEncoder().encode(bodyText);
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const signature = await createSignature(env.ADMIN_SYNC_SECRET!, timestamp, body);
    const url = `${env.ADMIN_SYNC_BASE_URL?.replace(/\/$/, "") || "https://aurax-admin-service.internal"}/api/ingest/v1/events`;
    const init: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Timestamp": timestamp,
        "X-Admin-Signature": signature,
      },
      body: bodyText,
    };
    return await withRequestDeadline(4_000, async (signal) => {
      const request = new Request(url, { ...init, signal });
      const response = env.ADMIN_SERVICE ? await env.ADMIN_SERVICE.fetch(request) : await fetch(request);
      if (!response.ok) throw new Error(`admin sync returned ${response.status}`);
      return response.json<Record<string, unknown>>();
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "admin_sync_failed", type: event.type, eventId: event.eventId, error: String(error) }));
    if (required) throw new AdminSyncError("发布服务暂时不可用，请稍后重试。");
    return null;
  }
}

export async function loadAdminGenerationConfiguration(env: Env, fallback: RuntimeGenerationConfiguration) {
  const generation = (await loadAdminConfiguration(env))?.generation;
  return validGeneration(generation) ? generation : fallback;
}

export async function loadAdminCreditPacks(env: Env, fallback: RuntimeCreditPack[], channel: "Bot" | "Mini App", termsVersion: string) {
  const configured = parseCreditPacks((await loadAdminConfiguration(env))?.creditPacks, channel, termsVersion);
  return configured ?? fallback;
}

export async function loadAdminSubscriptionPlans(env: Env, fallback: RuntimeSubscriptionPlan[], channel: "Bot" | "Mini App", termsVersion: string) {
  const configured = parseSubscriptionPlans((await loadAdminConfiguration(env))?.subscriptionPlans, channel, termsVersion);
  return configured ?? fallback;
}

export async function createSignature(secret: string, timestamp: string, body: ArrayBuffer | ArrayBufferView) {
  const bodyBytes = body instanceof ArrayBuffer ? new Uint8Array(body) : new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  const prefix = new TextEncoder().encode(`${timestamp}.`);
  const payload = new Uint8Array(prefix.byteLength + bodyBytes.byteLength);
  payload.set(prefix);
  payload.set(bodyBytes, prefix.byteLength);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, payload);
  return `sha256=${[...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export class AdminSyncError extends Error {}

export function createAdminPaymentOrder(env: Env, order: Omit<PaymentOrder, "status" | "telegramPaymentChargeId" | "updatedAt" | "precheckoutApprovedAt" | "paidAt" | "failedAt">) {
  return adminPaymentRequest<{ order: PaymentOrder }>(env, "/api/ingest/v1/payment-orders", "POST", order).then((value) => value.order);
}

export function loadAdminPaymentOrder(env: Env, orderId: string) {
  return adminPaymentRequest<{ order: PaymentOrder }>(env, `/api/ingest/v1/payment-orders/${encodeURIComponent(orderId)}`, "GET").then((value) => value.order);
}

export function markAdminPaymentOrderPrecheckout(env: Env, orderId: string) {
  return adminPaymentRequest<{ order: PaymentOrder }>(env, `/api/ingest/v1/payment-orders/${encodeURIComponent(orderId)}/precheckout`, "POST", {}).then((value) => value.order);
}

export function markAdminPaymentOrderFailed(env: Env, orderId: string) {
  return adminPaymentRequest<{ order: PaymentOrder }>(env, `/api/ingest/v1/payment-orders/${encodeURIComponent(orderId)}/failed`, "POST", {}).then((value) => value.order);
}

export function claimAdminNewUserGift(env: Env, externalUserId: string) {
  return adminSignedRequest<{ gift: NewUserGiftClaim }>(env, "/api/ingest/v1/new-user-gifts", "POST", { externalUserId }, "new user gift")
    .then((value) => value.gift);
}

export function bootstrapAdminReferral(env: Env, externalUserId: string, startParam = "") {
  return adminSignedRequest<{ referral: ReferralOverview }>(env, "/api/ingest/v1/referrals/bootstrap", "POST", { externalUserId, startParam }, "referral")
    .then((value) => value.referral);
}

export function recordAdminReferralGeneration(env: Env, externalUserId: string, jobId: string, occurredAt?: string) {
  return adminSignedRequest<{ result: { applied: boolean; status: string } }>(env, "/api/ingest/v1/referrals/generation-completed", "POST", { externalUserId, jobId, occurredAt }, "referral")
    .then((value) => value.result);
}

async function adminPaymentRequest<T>(env: Env, path: string, method: "GET" | "POST", input?: unknown): Promise<T> {
  return adminSignedRequest<T>(env, path, method, input, "payment order");
}

async function adminSignedRequest<T>(env: Env, path: string, method: "GET" | "POST", input: unknown, operation: string): Promise<T> {
  if (!adminSyncConfigured(env)) throw new AdminSyncError(adminOperationUnavailable(operation, false));
  const bodyText = input === undefined ? "" : JSON.stringify(input);
  const body = new TextEncoder().encode(bodyText);
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const signature = await createSignature(env.ADMIN_SYNC_SECRET!, timestamp, body);
  const url = `${env.ADMIN_SYNC_BASE_URL?.replace(/\/$/, "") || "https://aurax-admin-service.internal"}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Admin-Timestamp": timestamp,
      "X-Admin-Signature": signature,
    },
    body: method === "POST" ? bodyText : undefined,
  };
  try {
    return await withRequestDeadline(4_000, async (signal) => {
      const request = new Request(url, { ...init, signal });
      const response = env.ADMIN_SERVICE ? await env.ADMIN_SERVICE.fetch(request) : await fetch(request);
      const payload = await response.json() as T;
      if (!response.ok || !payload) throw new Error(`admin service returned ${response.status}`);
      return payload;
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "admin_signed_request_failed", operation, path, method, error: String(error) }));
    throw new AdminSyncError(adminOperationUnavailable(operation, true));
  }
}

function adminOperationUnavailable(operation: string, temporary: boolean) {
  if (operation === "new user gift") return temporary ? "新用户赠送服务暂时不可用，请稍后再试。" : "新用户赠送服务尚未配置，请稍后再试。";
  if (operation === "referral") return temporary ? "邀请奖励服务暂时不可用，请稍后再试。" : "邀请奖励服务尚未配置，请稍后再试。";
  return temporary ? "支付订单服务暂时不可用，请稍后再试。" : "支付订单服务尚未配置，请稍后再试。";
}

function validGeneration(value: Partial<RuntimeGenerationConfiguration> | undefined): value is RuntimeGenerationConfiguration {
  return Boolean(value && typeof value.model === "string" && value.model.length > 1 && Number.isSafeInteger(value.durationSeconds)
    && typeof value.aspectRatio === "string" && typeof value.quality === "string" && typeof value.audioEnabled === "boolean"
    && Number.isSafeInteger(value.maxPromptLength) && Number.isSafeInteger(value.maxImageBytes) && Number.isSafeInteger(value.maxConcurrentJobs));
}

async function loadAdminConfiguration(env: Env) {
  const cacheKey = env.ADMIN_SERVICE ? env.ADMIN_SERVICE as unknown as object : env.ADMIN_SYNC_BASE_URL?.trim() || "";
  if (cachedConfiguration && cachedConfiguration.key === cacheKey && cachedConfiguration.expiresAt > Date.now()) return cachedConfiguration.value;
  if (!env.ADMIN_SERVICE && !env.ADMIN_SYNC_BASE_URL?.trim()) return null;
  const pending = pendingConfigurations.get(cacheKey);
  if (pending) return pending;
  const loading = fetchAdminConfiguration(env, cacheKey);
  pendingConfigurations.set(cacheKey, loading);
  try { return await loading; }
  finally { pendingConfigurations.delete(cacheKey); }
}

async function fetchAdminConfiguration(env: Env, cacheKey: object | string) {
  try {
    const url = `${env.ADMIN_SYNC_BASE_URL?.replace(/\/$/, "") || "https://aurax-admin-service.internal"}/api/public/v1/configuration`;
    const body = await withRequestDeadline(2_000, async (signal) => {
      const request = new Request(url, { headers: { Accept: "application/json" }, signal });
      const response = env.ADMIN_SERVICE ? await env.ADMIN_SERVICE.fetch(request) : await fetch(request);
      if (!response.ok) return null;
      return response.json<{ configuration?: AdminConfigurationPayload }>();
    });
    if (!body) return null;
    const value = body.configuration || {};
    cachedConfiguration = { key: cacheKey, value, expiresAt: Date.now() + 60_000 };
    return value;
  } catch (error) {
    console.error(JSON.stringify({ event: "admin_configuration_fetch_failed", error: String(error) }));
    return null;
  }
}

function parseCreditPacks(value: unknown, channel: "Bot" | "Mini App", termsVersion: string): RuntimeCreditPack[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const packs: RuntimeCreditPack[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const pack = item as Record<string, unknown>;
    if (typeof pack.id !== "string" || typeof pack.title !== "string" || typeof pack.description !== "string"
      || !Number.isSafeInteger(pack.stars) || !Number.isSafeInteger(pack.baseCredits) || !Number.isSafeInteger(pack.bonusCredits)
      || typeof pack.status !== "string" || !Array.isArray(pack.channels) || typeof pack.termsVersion !== "string") return null;
    if (pack.status !== "active" || !pack.channels.includes(channel) || pack.termsVersion !== termsVersion) continue;
    packs.push({
      id: pack.id,
      title: pack.title,
      description: pack.description,
      stars: Number(pack.stars),
      credits: Number(pack.baseCredits) + Number(pack.bonusCredits),
    });
  }
  return packs;
}

function parseSubscriptionPlans(value: unknown, channel: "Bot" | "Mini App", termsVersion: string): RuntimeSubscriptionPlan[] | null {
  if (!Array.isArray(value)) return null;
  const plans: RuntimeSubscriptionPlan[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const plan = item as Record<string, unknown>;
    if (typeof plan.id !== "string" || typeof plan.title !== "string" || typeof plan.description !== "string"
      || !Number.isSafeInteger(plan.stars) || !Number.isSafeInteger(plan.creditsPerCycle) || !Number.isSafeInteger(plan.periodSeconds)
      || typeof plan.status !== "string" || typeof plan.recommended !== "boolean" || !Array.isArray(plan.channels)
      || typeof plan.termsVersion !== "string") return null;
    if (plan.status !== "active" || !plan.channels.includes(channel) || plan.termsVersion !== termsVersion) continue;
    plans.push({
      id: plan.id,
      title: plan.title,
      description: plan.description,
      stars: Number(plan.stars),
      creditsPerCycle: Number(plan.creditsPerCycle),
      periodSeconds: Number(plan.periodSeconds),
      recommended: plan.recommended,
    });
  }
  return plans;
}
