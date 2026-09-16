import assert from "node:assert/strict";
import test from "node:test";
import { MiniAppAuthError, validateTelegramInitData, validateTelegramInitDataContext } from "../src/mini-app-auth.ts";

const encoder = new TextEncoder();
const BOT_TOKEN = "123456:test-token-for-local-tests";
const NOW = 1_800_000_000;

async function signedInitData(overrides: Record<string, string> = {}) {
  const params = new URLSearchParams({
    auth_date: String(NOW - 30),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: JSON.stringify({ id: 424242, first_name: "Test", username: "test_user" }),
    ...overrides,
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const webAppDataKey = await crypto.subtle.importKey("raw", encoder.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const secretKey = await crypto.subtle.sign("HMAC", webAppDataKey, encoder.encode(BOT_TOKEN));
  const validationKey = await crypto.subtle.importKey("raw", secretKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", validationKey, encoder.encode(dataCheckString));
  params.set("hash", [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join(""));
  return params.toString();
}

test("accepts a correctly signed Telegram Mini App user", async () => {
  const user = await validateTelegramInitData(await signedInitData(), BOT_TOKEN, { nowSeconds: NOW, maxAgeSeconds: 300 });
  assert.equal(user.id, 424242);
  assert.equal(user.username, "test_user");
});

test("reads a referral start parameter only after Telegram signature validation", async () => {
  const context = await validateTelegramInitDataContext(await signedInitData({ start_param: "ref--inv_ab12cd34ef56" }), BOT_TOKEN, { nowSeconds: NOW, maxAgeSeconds: 300 });
  assert.equal(context.user.id, 424242);
  assert.equal(context.startParam, "ref--inv_ab12cd34ef56");
});

test("rejects tampered initData", async () => {
  const initData = (await signedInitData()).replace("test_user", "attacker");
  await assert.rejects(() => validateTelegramInitData(initData, BOT_TOKEN, { nowSeconds: NOW }), MiniAppAuthError);
});

test("rejects expired initData", async () => {
  const initData = await signedInitData({ auth_date: String(NOW - 301) });
  await assert.rejects(() => validateTelegramInitData(initData, BOT_TOKEN, { nowSeconds: NOW, maxAgeSeconds: 300 }), /expired/);
});

test("authentication diagnostics distinguish expiry, tampering and invalid signed dates", async () => {
  await assert.rejects(validateTelegramInitData(await signedInitData({ auth_date: String(NOW - 301) }), BOT_TOKEN, { nowSeconds: NOW, maxAgeSeconds: 300 }), { reason: "session_expired" });
  await assert.rejects(validateTelegramInitData((await signedInitData()).replace("test_user", "attacker"), BOT_TOKEN, { nowSeconds: NOW }), { reason: "invalid_signature" });
  for (const value of [String(NOW + 31), `${NOW}garbage`, ""]) {
    await assert.rejects(validateTelegramInitData(await signedInitData({ auth_date: value }), BOT_TOKEN, { nowSeconds: NOW }), { reason: "invalid_auth_date" });
  }
  await assert.rejects(validateTelegramInitData(await signedInitData({ user: "null" }), BOT_TOKEN, { nowSeconds: NOW }), { reason: "invalid_user" });
});
