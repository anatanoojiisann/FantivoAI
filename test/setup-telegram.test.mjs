import assert from "node:assert/strict";
import test from "node:test";
import { createTelegramClient } from "../scripts/lib/telegram.mjs";

test("Bot setup sends JSON requests and unwraps Telegram results", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "https://api.telegram.org/botsetup-test-token/setMyName");
    assert.equal(init.method, "POST");
    assert.equal(init.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(init.body), { name: "Fantivo AI" });
    return Response.json({ ok: true, result: true });
  });
  assert.equal(await createTelegramClient("setup-test-token")("setMyName", { name: "Fantivo AI" }), true);
});

test("Bot setup preserves multipart bodies and lets fetch set their boundary", async (t) => {
  const body = new FormData();
  body.set("photo", new Blob(["test-avatar"], { type: "image/jpeg" }), "avatar.jpg");
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    assert.equal(init.body, body);
    assert.equal(init.headers, undefined);
    return Response.json({ ok: true, result: { accepted: true } });
  });
  assert.deepEqual(await createTelegramClient("setup-test-token")("setMyProfilePhoto", body), { accepted: true });
});

test("Bot setup rejects HTTP and Telegram API failures", async (t) => {
  for (const [status, payload, message] of [
    [200, { ok: false, description: "invalid request" }, /invalid request/],
    [502, { ok: false }, /getMe failed/],
    [500, { ok: true, result: true }, /getMe failed/],
  ]) {
    const mock = t.mock.method(globalThis, "fetch", async () => Response.json(payload, { status }));
    await assert.rejects(createTelegramClient("setup-test-token")("getMe"), message);
    mock.mock.restore();
  }
});

test("Bot setup requires a token before any network request", () => {
  assert.throws(() => createTelegramClient(""), /TELEGRAM_BOT_TOKEN is required/);
});
