import type { CreditPackConfiguration, SubscriptionPlanConfiguration } from "../../shared/contracts";
export type { CreditPackConfiguration, SubscriptionPlanConfiguration } from "../../shared/contracts";

import { assertInteger, assertString } from "./http";
import { HttpError } from "./types";

export type NewUserGiftConfiguration = {
  credits: number;
  enabledAt: string | null;
};

export type ReferralConfiguration = {
  enabled: boolean;
  rewardCredits: number;
  weeklyLimit: number;
};

export function defaultReferralConfiguration(): ReferralConfiguration {
  return { enabled: true, rewardCredits: 100, weeklyLimit: 5 };
}

export function validateNewUserGiftCredits(value: unknown) {
  return assertInteger(value, "新用户赠送 Credits", 0, 10_000_000);
}

export function validateReferralConfiguration(value: unknown): ReferralConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidReferral("邀请奖励配置格式无效。");
  const input = value as Record<string, unknown>;
  if (typeof input.enabled !== "boolean") invalidReferral("邀请奖励开关无效。");
  return {
    enabled: input.enabled,
    rewardCredits: assertInteger(input.rewardCredits, "邀请奖励 Credits", 1, 10_000_000),
    weeklyLimit: assertInteger(input.weeklyLimit, "每周奖励人数上限", 1, 100),
  };
}

export function validateCreditPacks(value: unknown): CreditPackConfiguration[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) invalid("套餐数量必须在 1 到 20 个之间。");
  const ids = new Set<string>();
  const packs = value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) invalid(`第 ${index + 1} 个套餐格式无效。`);
    const input = item as Record<string, unknown>;
    const id = assertString(input.id, "套餐 ID", { min: 2, max: 40, pattern: /^[a-z0-9][a-z0-9_-]+$/ });
    if (ids.has(id)) invalid("套餐 ID 不能重复。");
    ids.add(id);
    const description = typeof input.description === "string" ? input.description.trim() : "";
    if (description.length > 160) invalid("套餐说明不能超过 160 个字符。");
    const status = input.status;
    if (status !== "active" && status !== "draft" && status !== "inactive") invalid("套餐状态无效。");
    if (typeof input.recommended !== "boolean") invalid("推荐套餐字段无效。");
    if (!Array.isArray(input.channels) || !input.channels.length || input.channels.some((channel) => channel !== "Bot" && channel !== "Mini App")) {
      invalid("套餐至少需要一个有效发布渠道。");
    }
    const channels = [...new Set(input.channels)] as Array<"Bot" | "Mini App">;
    const pack: CreditPackConfiguration = {
      id,
      title: assertString(input.title, "套餐名称", { min: 2, max: 80 }),
      description,
      stars: assertInteger(input.stars, "Stars 售价", 1, 1_000_000),
      baseCredits: assertInteger(input.baseCredits, "基础 Credits", 1, 10_000_000),
      bonusCredits: assertInteger(input.bonusCredits, "赠送 Credits", 0, 10_000_000),
      status,
      recommended: input.recommended,
      channels,
      termsVersion: assertString(input.termsVersion, "条款版本", { min: 10, max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ }),
    };
    if (pack.recommended && pack.status !== "active") invalid("推荐套餐必须处于正常状态。");
    return pack;
  });
  if (!packs.some((pack) => pack.status === "active")) invalid("至少保留一个正常状态的套餐。");
  if (packs.filter((pack) => pack.recommended).length > 1) invalid("最多只能设置一个推荐套餐。");
  return packs;
}

export function validateSubscriptionPlans(value: unknown): SubscriptionPlanConfiguration[] {
  if (!Array.isArray(value) || value.length > 20) invalidSubscription("订阅计划数量必须在 0 到 20 个之间。");
  const ids = new Set<string>();
  const plans = value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) invalidSubscription(`第 ${index + 1} 个订阅计划格式无效。`);
    const input = item as Record<string, unknown>;
    const id = assertString(input.id, "订阅计划 ID", { min: 2, max: 40, pattern: /^[a-z0-9][a-z0-9_-]+$/ });
    if (ids.has(id)) invalidSubscription("订阅计划 ID 不能重复。");
    ids.add(id);
    const description = typeof input.description === "string" ? input.description.trim() : "";
    if (description.length > 160) invalidSubscription("订阅计划说明不能超过 160 个字符。");
    const status = input.status;
    if (status !== "active" && status !== "draft" && status !== "inactive") invalidSubscription("订阅计划状态无效。");
    if (typeof input.recommended !== "boolean") invalidSubscription("订阅推荐字段无效。");
    if (!Array.isArray(input.channels) || !input.channels.length || input.channels.some((channel) => channel !== "Bot" && channel !== "Mini App")) {
      invalidSubscription("订阅计划至少需要一个有效发布渠道。");
    }
    const periodSeconds = assertInteger(input.periodSeconds, "订阅周期", 2_592_000, 2_592_000);
    const plan: SubscriptionPlanConfiguration = {
      id,
      title: assertString(input.title, "订阅计划名称", { min: 2, max: 80 }),
      description,
      stars: assertInteger(input.stars, "订阅 Stars 售价", 1, 1_000_000),
      creditsPerCycle: assertInteger(input.creditsPerCycle, "每周期 Credits", 1, 10_000_000),
      periodSeconds: periodSeconds as 2592000,
      status,
      recommended: input.recommended,
      channels: [...new Set(input.channels)] as Array<"Bot" | "Mini App">,
      termsVersion: assertString(input.termsVersion, "条款版本", { min: 10, max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ }),
    };
    if (plan.recommended && plan.status !== "active") invalidSubscription("推荐订阅计划必须处于正常状态。");
    return plan;
  });
  if (plans.filter((plan) => plan.status === "active").length > 3) invalidSubscription("最多只能发布三个正常状态的订阅计划。");
  if (plans.filter((plan) => plan.recommended).length > 1) invalidSubscription("最多只能设置一个推荐订阅计划。");
  return plans;
}

function invalid(message: string): never {
  throw new HttpError(422, "invalid_credit_packs", message);
}

function invalidSubscription(message: string): never {
  throw new HttpError(422, "invalid_subscription_plans", message);
}

function invalidReferral(message: string): never {
  throw new HttpError(422, "invalid_referral_configuration", message);
}
