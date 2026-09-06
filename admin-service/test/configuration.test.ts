import assert from "node:assert/strict";
import test from "node:test";
import { validateCreditPacks, validateNewUserGiftCredits, validateReferralConfiguration, validateSubscriptionPlans } from "../src/configuration.ts";

const pack = {
  id: "creator",
  title: "Creator Pack",
  description: "1,800 credits",
  stars: 300,
  baseCredits: 1_800,
  bonusCredits: 0,
  status: "active",
  recommended: true,
  channels: ["Bot", "Mini App"],
  termsVersion: "2026-08-04",
};

test("credit pack configuration is normalized and accepted", () => {
  const result = validateCreditPacks([{ ...pack, channels: ["Bot", "Bot", "Mini App"] }]);
  assert.deepEqual(result[0]?.channels, ["Bot", "Mini App"]);
  assert.equal(result[0]?.baseCredits, 1_800);
});

test("credit pack configuration rejects unsafe catalog states", () => {
  assert.throws(() => validateCreditPacks([]), /套餐数量/);
  assert.throws(() => validateCreditPacks([pack, { ...pack }]), /不能重复/);
  assert.throws(() => validateCreditPacks([{ ...pack, status: "inactive", recommended: false }]), /至少保留/);
  assert.throws(() => validateCreditPacks([{ ...pack, channels: [] }]), /发布渠道/);
  assert.throws(() => validateCreditPacks([{ ...pack, stars: 0 }]), /Stars 售价/);
});

const subscription = {
  id: "pro",
  title: "Pro",
  description: "Credits every 30 days",
  stars: 650,
  creditsPerCycle: 3_000,
  periodSeconds: 2_592_000,
  status: "active",
  recommended: true,
  channels: ["Mini App"],
  termsVersion: "2026-08-04",
};

test("subscription configuration accepts an empty catalog and fixed 30-day plans", () => {
  assert.deepEqual(validateSubscriptionPlans([]), []);
  const result = validateSubscriptionPlans([{ ...subscription, channels: ["Mini App", "Mini App"] }]);
  assert.equal(result[0]?.periodSeconds, 2_592_000);
  assert.deepEqual(result[0]?.channels, ["Mini App"]);
});

test("subscription configuration rejects unsafe recurring prices", () => {
  assert.throws(() => validateSubscriptionPlans([{ ...subscription, periodSeconds: 60 }]), /订阅周期/);
  assert.throws(() => validateSubscriptionPlans([subscription, { ...subscription }]), /不能重复/);
  assert.throws(() => validateSubscriptionPlans([{ ...subscription, stars: 0 }]), /Stars 售价/);
  assert.throws(() => validateSubscriptionPlans([{ ...subscription, status: "draft" }]), /推荐订阅计划/);
  assert.throws(() => validateSubscriptionPlans([0, 1, 2, 3].map((index) => ({ ...subscription, id: `plan-${index}`, recommended: false }))), /最多只能发布三个/);
});

test("new user gift credits can be configured or disabled safely", () => {
  assert.equal(validateNewUserGiftCredits(300), 300);
  assert.equal(validateNewUserGiftCredits(0), 0);
  assert.throws(() => validateNewUserGiftCredits(-1), /新用户赠送 Credits/);
  assert.throws(() => validateNewUserGiftCredits(1.5), /新用户赠送 Credits/);
  assert.throws(() => validateNewUserGiftCredits(10_000_001), /新用户赠送 Credits/);
});

test("referral rewards require a bounded reward and a rolling-week recipient cap", () => {
  assert.deepEqual(validateReferralConfiguration({ enabled: true, rewardCredits: 100, weeklyLimit: 5 }), { enabled: true, rewardCredits: 100, weeklyLimit: 5 });
  assert.throws(() => validateReferralConfiguration({ enabled: true, rewardCredits: 0, weeklyLimit: 5 }), /邀请奖励 Credits/);
  assert.throws(() => validateReferralConfiguration({ enabled: true, rewardCredits: 100, weeklyLimit: 101 }), /每周奖励人数上限/);
});
