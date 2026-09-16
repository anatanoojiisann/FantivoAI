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

test("Mini App rejects malformed JSON even on HTTP 200", async (context) => {
  context.mock.method(globalThis, "fetch", async () => new Response("not-json"));
  await assert.rejects(new MiniAppApi("signed-init-data").bootstrap(), { code: "invalid_response", status: 200 });
});

test("Mini App rejects an incomplete bootstrap before it can become application state", async (context) => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ code: "invalid_response" }));
  await assert.rejects(new MiniAppApi("signed-init-data").bootstrap(), { code: "invalid_response", status: 200 });
});

test("Mini App times out stalled fetch and body reads and aborts transport", async (context) => {
  for (const stage of ["headers", "body"]) {
    let signal: AbortSignal | undefined;
    const mock = context.mock.method(globalThis, "fetch", async (_input: unknown, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      if (stage === "headers") return new Promise<Response>(() => {});
      return new Response(new ReadableStream({ start() {} }));
    });
    await assert.rejects(new MiniAppApi("signed-init-data", "", 10).jobs(), { code: "request_timeout" });
    assert.equal(signal?.aborted, true);
    mock.mock.restore();
  }
});

test("generation timeout does not retry implicitly; explicit retry preserves request identity", async (context) => {
  const calls: RequestInit[] = [];
  context.mock.method(globalThis, "fetch", async (_input: unknown, init: RequestInit) => {
    calls.push(init);
    if (calls.length === 1) return new Promise<Response>(() => {});
    return Response.json({ job: { id: "already-created-job" }, replayed: true });
  });
  const api = new MiniAppApi("signed-init-data", "session-1234567890", 10);
  const requestId = "request-1234567890";
  await assert.rejects(api.createTextJob("hello world", 5, "9:16", requestId), { code: "request_timeout" });
  assert.equal(calls.length, 1);
  const result = await api.createTextJob("hello world", 5, "9:16", requestId);
  assert.equal(result.replayed, true);
  assert.equal(calls[0].body, calls[1].body);
  for (const call of calls) {
    assert.equal(new Headers(call.headers).get("X-Request-Id"), requestId);
    assert.equal(new Headers(call.headers).get("X-App-Session-Id"), "session-1234567890");
  }
});
