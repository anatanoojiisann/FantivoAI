import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, MiniAppApi } from "../web/src/api.ts";

test("Mini App converts browser network failures into a localizable error code", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };

  await assert.rejects(new MiniAppApi("signed-init-data").jobs(), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, "network_error");
    assert.equal(error.status, 0);
    assert.doesNotMatch(error.message, /Failed to fetch/);
    return true;
  });
});

test("Mini App gives invalid upstream responses an intentional error code", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response("not-json", { status: 503, headers: { "Content-Type": "text/plain" } });

  await assert.rejects(new MiniAppApi("signed-init-data").jobs(), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, "invalid_response");
    assert.equal(error.status, 503);
    return true;
  });
});
