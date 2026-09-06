import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { subscriptionPlanDialog, userDetail } from "../admin/src/details.ts";
import { demoData } from "../admin/src/mock-data.ts";
import { createSubscriptionPlanId } from "../admin/src/product-ids.ts";
import { renderPage, type ViewState } from "../admin/src/views.ts";

const state: Omit<ViewState, "page"> = {
  query: "",
  paymentTab: "transactions",
};

test("credits products and generation defaults render on separate pages", () => {
  const products = renderPage(demoData, { ...state, page: "configuration" });
  const generation = renderPage(demoData, { ...state, page: "generation" });

  assert.match(products, /Credits 商品/);
  assert.match(products, /name="newUserGiftCredits"/);
  assert.match(products, />300 credits<\/dd>/);
  const adminMain = readFileSync(new URL("../admin/src/main.ts", import.meta.url), "utf8");
  assert.match(adminMain, /newUserGiftCreditsDraft \?\? giftInput\.value/);
  assert.doesNotMatch(products, /id="config-form"/);
  assert.match(generation, /任务默认参数/);
  assert.match(generation, /id="config-form"/);
  assert.doesNotMatch(generation, /data-edit-pack/);
});

test("generation and analytics pages expose model and Mini App integrations", () => {
  const modelCatalog = {
    status: "ready" as const, version: "models-v1", syncedAt: "2026-08-05T00:00:00Z", responseTimeMs: 15,
    models: [{ id: "peach-max", name: "Peach Max", creditCost: 60, modes: ["text-to-video" as const], durations: [5], aspectRatios: ["9:16"], qualities: ["standard"], supportsAudio: true, enabled: true }],
  };
  const generation = renderPage(demoData, { ...state, page: "generation", modelCatalog });
  assert.match(generation, /模型能力目录/);
  assert.match(generation, /Peach Max/);

  const analytics = renderPage(demoData, { ...state, page: "analytics", miniAppAnalytics: {
    configured: false, status: "not_configured", from: "2026-07-30", to: "2026-08-05", fetchedAt: "2026-08-05T00:00:00Z", responseTimeMs: 0,
    totals: {}, distributions: { locales: [], personas: [], rankings: [], modes: [] },
  } });
  assert.match(analytics, /PostHog 尚未连接/);
});

test("subscription plans keep internal ids out of the operator workflow", () => {
  const createDialog = subscriptionPlanDialog();
  const editDialog = subscriptionPlanDialog(demoData.subscriptionPlans[0]);
  const products = renderPage(demoData, { ...state, page: "configuration" });

  assert.doesNotMatch(createDialog, /计划 ID|name="planId"/);
  assert.doesNotMatch(editDialog, /计划 ID/);
  assert.match(editDialog, /type="hidden" name="planId"/);
  assert.doesNotMatch(products, new RegExp(`<code>${demoData.subscriptionPlans[0].id}</code>`));
});

test("subscription plan ids are generated internally and avoid collisions", () => {
  const uuid = "12345678-1234-1234-1234-123456789abc";
  assert.equal(createSubscriptionPlanId([], () => uuid), "sub_123456781234123412341234");
  assert.throws(() => createSubscriptionPlanId(["sub_123456781234123412341234"], () => uuid), /无法生成/);
});

test("user list and profile expose the real Telegram ID as a dedicated field", () => {
  const user = demoData.users[0];
  const users = renderPage(demoData, { ...state, page: "users" });
  const profile = userDetail(user);

  assert.match(users, /<th>Telegram ID<\/th>/);
  assert.match(users, new RegExp(`telegram-id-value mono">${user.telegramId}<`));
  assert.match(profile, new RegExp(`<dt>Telegram ID<\/dt><dd class="mono">${user.telegramId}<\/dd>`));
});

test("analytics and user profiles expose acquisition data and controlled GPT analysis", () => {
  const analytics = renderPage(demoData, {
    ...state,
    page: "analytics",
    miniAppAnalytics: {
      configured: true, status: "ready", from: "2026-08-01", to: "2026-08-22", fetchedAt: "2026-08-22T00:00:00Z", responseTimeMs: 20,
      totals: { mini_app_opened: 20, payment_paid: 7 },
      distributions: { locales: [], personas: [], rankings: [], modes: [], acquisitionSources: [{ value: "xhs", count: 12 }], acquisitionCampaigns: [{ value: "launch", count: 8 }], acquisitionContent: [] },
    },
    analyticsAi: { configured: true, status: "ready", from: "2026-08-01", to: "2026-08-22", generatedAt: "2026-08-22T00:00:00Z", model: "gpt-5.6", answer: "小红书来源最多。", toolsUsed: [] },
  });
  assert.match(analytics, /首次来源分布/);
  assert.match(analytics, /AI 数据分析/);
  assert.match(analytics, /小红书来源最多/);
  assert.match(analytics, /支付成功<\/span>[\s\S]*?<strong>7<\/strong>/);

  const profile = userDetail(demoData.users[0], { found: true, externalUserId: demoData.users[0].externalUserId, source: "xhs", medium: "telegram_deep_link", campaign: "launch", content: "creator-01", startParam: "acq--xhs--launch--creator-01", firstSeenAt: "2026-08-01T00:00:00Z" });
  assert.match(profile, /首次来源/);
  assert.match(profile, /acq--xhs--launch--creator-01/);
});
