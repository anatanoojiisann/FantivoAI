import { DEFAULT_BOT_LOCALE, isBotLocale, type Locale } from "./bot-i18n";
import type { Env } from "./types";

const LOCALE_KEY_PREFIX = "telegram:locale:";
const SUBSCRIPTION_KEY_PREFIX = "telegram:subscription:";
const GENERATION_NOTIFICATION_KEY_PREFIX = "telegram:generation-notification:";
const GENERATION_NOTIFICATION_TTL_SECONDS = 90 * 24 * 60 * 60;

export type UserSubscription = {
  planId: string;
  status: "active";
  startedAt: string;
  renewedAt: string;
  expiresAt: number;
  lastChargeId: string;
  isCanceled: boolean;
};

export async function userLocale(env: Env, telegramUserId: number): Promise<Locale> {
  if (!env.USER_PREFERENCES) return DEFAULT_BOT_LOCALE;
  try {
    const stored = await env.USER_PREFERENCES.get(`${LOCALE_KEY_PREFIX}${telegramUserId}`);
    return stored && isBotLocale(stored) ? stored : DEFAULT_BOT_LOCALE;
  } catch (error) {
    console.error(JSON.stringify({ event: "bot_locale_read_failed", telegramUserId, error: String(error) }));
    return DEFAULT_BOT_LOCALE;
  }
}

export async function saveUserLocale(env: Env, telegramUserId: number, locale: Locale): Promise<void> {
  if (!env.USER_PREFERENCES) return;
  await env.USER_PREFERENCES.put(`${LOCALE_KEY_PREFIX}${telegramUserId}`, locale);
}

export async function userSubscription(env: Env, telegramUserId: number): Promise<UserSubscription | null> {
  if (!env.USER_PREFERENCES) return null;
  try {
    const value = await env.USER_PREFERENCES.get(`${SUBSCRIPTION_KEY_PREFIX}${telegramUserId}`);
    if (!value) return null;
    const subscription = JSON.parse(value) as Partial<UserSubscription>;
    if (subscription.status !== "active" || typeof subscription.planId !== "string" || !subscription.planId
      || typeof subscription.startedAt !== "string" || typeof subscription.renewedAt !== "string"
      || !Number.isSafeInteger(subscription.expiresAt) || typeof subscription.lastChargeId !== "string" || !subscription.lastChargeId
      || (subscription.isCanceled !== undefined && typeof subscription.isCanceled !== "boolean")) return null;
    return { ...subscription, isCanceled: subscription.isCanceled === true } as UserSubscription;
  } catch (error) {
    console.error(JSON.stringify({ event: "user_subscription_read_failed", telegramUserId, error: String(error) }));
    return null;
  }
}

export function subscriptionIsActive(subscription: UserSubscription | null, nowSeconds = Math.floor(Date.now() / 1_000)) {
  return Boolean(subscription && subscription.status === "active" && subscription.expiresAt > nowSeconds);
}

export async function saveUserSubscription(env: Env, telegramUserId: number, subscription: UserSubscription): Promise<void> {
  if (!env.USER_PREFERENCES) throw new Error("subscription state storage is unavailable");
  await env.USER_PREFERENCES.put(`${SUBSCRIPTION_KEY_PREFIX}${telegramUserId}`, JSON.stringify(subscription));
}

export async function wasGenerationNotificationSent(env: Env, jobId: string): Promise<boolean> {
  if (!env.USER_PREFERENCES) return false;
  try {
    return await env.USER_PREFERENCES.get(`${GENERATION_NOTIFICATION_KEY_PREFIX}${jobId}`) === "sent";
  } catch (error) {
    console.error(JSON.stringify({ event: "generation_notification_state_read_failed", jobId, error: String(error) }));
    return false;
  }
}

export async function markGenerationNotificationSent(env: Env, jobId: string): Promise<void> {
  if (!env.USER_PREFERENCES) return;
  try {
    await env.USER_PREFERENCES.put(`${GENERATION_NOTIFICATION_KEY_PREFIX}${jobId}`, "sent", { expirationTtl: GENERATION_NOTIFICATION_TTL_SECONDS });
  } catch (error) {
    console.error(JSON.stringify({ event: "generation_notification_state_write_failed", jobId, error: String(error) }));
  }
}
