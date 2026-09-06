import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worker = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const store = readFileSync(new URL("../src/store.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8");
const paymentMigration = readFileSync(new URL("../migrations/0002_payment_channel.sql", import.meta.url), "utf8");
const externalMediaMigration = readFileSync(new URL("../migrations/0003_external_media.sql", import.meta.url), "utf8");
const authMigration = readFileSync(new URL("../migrations/0004_admin_auth.sql", import.meta.url), "utf8");
const subscriptionMigration = readFileSync(new URL("../migrations/0005_subscription_payments.sql", import.meta.url), "utf8");
const affiliateMigration = readFileSync(new URL("../migrations/0006_telegram_affiliate.sql", import.meta.url), "utf8");
const referralMigration = readFileSync(new URL("../migrations/0007_referrals.sql", import.meta.url), "utf8");
const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const adminMain = readFileSync(new URL("../../admin/src/main.ts", import.meta.url), "utf8");
const adminRepository = readFileSync(new URL("../../admin/src/repository.ts", import.meta.url), "utf8");
const platform = readFileSync(new URL("../src/platform.ts", import.meta.url), "utf8");
const referrals = readFileSync(new URL("../src/referrals.ts", import.meta.url), "utf8");

test("admin mutations are protected and ingestion requires a signature", () => {
  assert.match(worker, /requireAdmin\(request, env\)/);
  assert.match(worker, /requireIngestSignature/);
  assert.match(worker, /\/api\/admin\/v1\/bootstrap/);
  assert.match(worker, /\/api\/admin\/v1\/configuration-versions/);
  assert.doesNotMatch(worker, /\/api\/admin\/v1\/home-feed\/preview/);
  assert.match(worker, /\/api\/admin\/v1\/model-catalog/);
  assert.match(worker, /\/api\/admin\/v1\/analytics\/mini-app/);
  assert.match(worker, /analytics\/mini-app\/analyze/);
  assert.match(worker, /fetchUserAcquisition/);
  assert.match(worker, /\/api\/auth\/v1\/login/);
  assert.match(authMigration, /last_totp_counter/);
  assert.match(authMigration, /blocked_until/);
  assert.match(adminRepository, /X-CSRF-Token/);
  assert.doesNotMatch(adminMain, /publications|发布审核/);
  assert.doesNotMatch(adminRepository, /reviewPublication/);
  assert.doesNotMatch(wrangler, /CF_ACCESS/);
  assert.match(wrangler, /"ADMIN_TOTP_REQUIRED": "false"/);
  assert.match(wrangler, /"run_worker_first": \["\/", "\/index\.html"/);
  assert.match(adminMain, /session\.totpRequired/);
  assert.match(adminMain, /document\.addEventListener\("submit",[\s\S]*capture: true/);
  assert.match(adminMain, /data-analyze-analytics/);
});

test("payment records retain Bot or Mini App funnel provenance", () => {
  assert.match(paymentMigration, /channel TEXT NOT NULL DEFAULT 'Bot'/);
  assert.match(paymentMigration, /funnel_entry TEXT NOT NULL DEFAULT 'buy_command'/);
  assert.match(store, /funnel_entry AS funnelEntry/);
});

test("subscription payments retain recurring cycle metadata", () => {
  assert.match(subscriptionMigration, /product_type TEXT NOT NULL DEFAULT 'credit_pack'/);
  assert.match(subscriptionMigration, /is_recurring INTEGER NOT NULL DEFAULT 0/);
  assert.match(subscriptionMigration, /subscription_expiration_date INTEGER/);
  assert.match(store, /subscriptionExpirationDate/);
  assert.match(store, /subscriptionPlans/);
});

test("public feeds only select published content", () => {
  assert.match(store, /WHERE p\.status = 'published'/);
  assert.match(migration, /status IN \('pending_review', 'published', 'rejected', 'withdrawn', 'removed'\)/);
  assert.doesNotMatch(worker, /publishMedia/);
  assert.doesNotMatch(worker, /\/api\/admin\/v1\/publications/);
  assert.match(externalMediaMigration, /media_status/);
  assert.doesNotMatch(wrangler, /r2_buckets/);
});

test("wallet adjustments and ingestion events are idempotent", () => {
  assert.match(migration, /reference_id TEXT PRIMARY KEY/);
  assert.match(migration, /reference_id TEXT NOT NULL UNIQUE/);
  assert.match(migration, /event_id TEXT PRIMARY KEY/);
});

test("new user gifts are signed, configurable and recorded once as gift ledger entries", () => {
  assert.match(worker, /\/api\/ingest\/v1\/new-user-gifts/);
  assert.match(worker, /requireIngestSignature\(request, env\.ADMIN_INGEST_SECRET, body\)/);
  assert.match(worker, /newUserGiftCredits/);
  assert.match(store, /newUserGift/);
  assert.match(platform, /new-user-gift-\$\{externalUserId\}/);
  assert.match(platform, /entry_type = 'gift'/);
  assert.match(platform, /INSERT OR IGNORE INTO wallet_entries/);
  assert.match(platform, /Date\.parse\(user\.joinedAt\) < Date\.parse\(gift\.enabledAt\)/);
});

test("Telegram Stars orders and transaction events have independent idempotency keys", () => {
  assert.match(affiliateMigration, /CREATE TABLE telegram_payment_orders/);
  assert.match(affiliateMigration, /invoice_payload TEXT NOT NULL UNIQUE/);
  assert.match(affiliateMigration, /telegram_payment_charge_id TEXT UNIQUE/);
  assert.match(affiliateMigration, /CREATE TABLE telegram_star_transaction_events/);
  assert.match(affiliateMigration, /event_key TEXT PRIMARY KEY/);
  assert.doesNotMatch(affiliateMigration, /telegram_transaction_id TEXT NOT NULL UNIQUE/);
  assert.match(worker, /analytics\/telegram-affiliate/);
  assert.match(worker, /telegram-stars\/sync/);
  assert.match(adminMain, /Telegram Affiliate/);
});

test("referral rewards are configured, idempotent and capped before wallet crediting", () => {
  assert.match(worker, /referrals\/bootstrap/);
  assert.match(worker, /referrals\/generation-completed/);
  assert.match(worker, /validateReferralConfiguration/);
  assert.match(referralMigration, /CREATE TABLE IF NOT EXISTS referrals/);
  assert.match(referralMigration, /invitee_user_id TEXT NOT NULL UNIQUE/);
  assert.match(referralMigration, /referral_generation_events/);
  assert.match(referralMigration, /referral_reward_slots/);
  assert.match(referrals, /rollingWeekStart/);
  assert.match(referrals, /referral-reward-\$\{referral\.id\}/);
  assert.match(referrals, /status = 'rewarded'/);
});

test("page navigation closes an open action dialog", () => {
  assert.match(adminMain, /if \(dialog\.open\) dialog\.close\(\)/);
});
