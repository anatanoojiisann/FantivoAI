import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const platform = readFileSync(new URL("../src/open-platform.ts", import.meta.url), "utf8");
const telegram = readFileSync(new URL("../src/telegram.ts", import.meta.url), "utf8");
const types = readFileSync(new URL("../src/types.ts", import.meta.url), "utf8");
const payment = readFileSync(new URL("../src/payment.ts", import.meta.url), "utf8");
const miniApp = readFileSync(new URL("../src/mini-app.ts", import.meta.url), "utf8");
const adminSync = readFileSync(new URL("../src/admin-sync.ts", import.meta.url), "utf8");
const miniAppUi = readFileSync(new URL("../web/src/main.ts", import.meta.url), "utf8");

test("payment fulfillment waits for successful_payment and is idempotent", () => {
  assert.match(source, /successful_payment/);
  assert.match(source, /telegram_payment_charge_id/);
  assert.match(platform, /transactionId: input\.transactionId/);
});

test("generation calls use deterministic Telegram update idempotency", () => {
  assert.match(source, /telegram-update-\$\{updateId\}/);
  assert.match(platform, /Idempotency-Key/);
});

test("home feed only selects personas allowed by the platform API key", () => {
  assert.match(platform, /\/v1\/personas/);
  assert.match(platform, /\/v1\/home\?/);
  assert.match(platform, /query\.set\("personaCode"/);
  assert.doesNotMatch(platform, /X-Aurax-Home-Persona/);
  assert.match(source, /--persona=/);
});

test("template and asset follow creation stay inside the Open Platform boundary", () => {
  assert.match(platform, /\/v1\/content\/\$\{kind\}/);
  assert.match(platform, /createFromTemplate/);
  assert.match(platform, /followAsset/);
  assert.match(source, /\/template/);
  assert.match(source, /\/follow/);
  assert.doesNotMatch(platform, /api\.aurax\.one\/(?!tgbot)/);
});

test("asset follow and image templates upload through the platform first", () => {
  assert.match(source, /platform\.upload/);
  assert.match(source, /platform\.followAsset/);
  assert.match(source, /platform\.createFromTemplate/);
});

test("content selection renders the editable prompt and server-owned reference preview", () => {
  assert.match(types, /prompt\?: string/);
  assert.match(types, /defaultReferenceImageUrl\?: string/);
  assert.match(source, /content\.defaultReferenceImageUrl/);
  assert.match(source, /content\.defaultReferenceEnabled && !!content\.defaultReferenceImageUrl/);
  assert.match(source, /content\.prompt/);
  assert.match(source, /sendContentPreview/);
  assert.match(telegram, /sendPhoto/);
});

test("factory uses the production Open Platform boundary and public model catalog", () => {
  const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  assert.match(wrangler, /https:\/\/api\.aurax\.one\/tgbot/);
  assert.match(platform, /\/v1\/models/);
  assert.doesNotMatch(platform, /\/v1\/admin|\/admin\//);
});

test("secrets are environment bindings and not literal values", () => {
  assert.match(source, /env\.TELEGRAM_WEBHOOK_SECRET/);
  assert.match(platform, /env\.OPEN_PLATFORM_API_KEY/);
  assert.doesNotMatch(source, /tgbp_live_[a-f0-9]{20,}/);
});

test("digital goods expose payment support and omit provider token", () => {
  assert.match(source, /text === "\/paysupport"/);
  assert.match(source, /text === "\/terms"/);
  assert.match(source, /text === "\/language"/);
  assert.doesNotMatch(telegram, /provider_token/);
});

test("Mini App progress remains compatible with the strict style CSP", () => {
  assert.match(miniAppUi, /<progress class="progress"/);
  assert.doesNotMatch(miniAppUi, /style="width:\$\{progress\}%"/);
});

test("payment invoice records the accepted terms version", () => {
  assert.match(payment, /TERMS_VERSION/);
  assert.match(payment, /v2\|/);
  assert.match(miniApp, /terms_not_accepted/);
  assert.match(source, /buy:accept:/);
});

test("Mini App APIs authenticate initData and never accept an external user id", () => {
  assert.match(source, /miniAppApi\(request, env\)/);
  assert.match(miniApp, /validateTelegramInitData/);
  assert.doesNotMatch(miniApp, /input\.externalUserId/);
});

test("referral attribution, qualified generation rewards and low-credit guidance stay server-owned", () => {
  assert.match(miniApp, /validateTelegramInitDataContext/);
  assert.match(miniApp, /bootstrapAdminReferral/);
  assert.match(miniApp, /recordAdminReferralGeneration/);
  assert.match(source, /recordAdminReferralGeneration/);
  assert.match(miniAppUi, /referral-section/);
  assert.match(miniAppUi, /insufficient_credits/);
  assert.match(miniAppUi, /inviteEarn/);
});

test("admin synchronization is signed and publication submission is review-gated", () => {
  assert.match(adminSync, /HMAC/);
  assert.match(adminSync, /X-Admin-Timestamp/);
  assert.match(adminSync, /X-Admin-Signature/);
  assert.match(miniApp, /synchronized\.status : "pending_review"/);
  assert.match(miniApp, /job\.externalUserId !== platform\.externalUserId\(user\)/);
});
