import assert from "node:assert/strict";
import test from "node:test";
import { OpenPlatformClient } from "../src/open-platform.ts";
import type { Env } from "../src/types.ts";

const env = { OPEN_PLATFORM_BASE_URL: "https://platform.invalid", OPEN_PLATFORM_API_KEY: "local-only", DEFAULT_MODEL: "test" } as Env;

test("platform deadlines cover a stalled body and retry GET only once", async (context) => {
  const setTimeoutOriginal = globalThis.setTimeout;
  context.mock.method(globalThis, "setTimeout", (fn: () => void, ms: number) => setTimeoutOriginal(fn, ms === 8_000 ? 5 : 1));
  let calls = 0;
  const signals: AbortSignal[] = [];
  context.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    calls += 1;
    signals.push(init.signal as AbortSignal);
    return new Response(new ReadableStream({ start() {} }));
  });
  await assert.rejects(new OpenPlatformClient(env).models(), { code: "request_timeout" });
  assert.equal(calls, 2);
  assert.ok(signals.every((signal) => signal.aborted));
});

test("a timeout retry of generation retains the idempotency key and body", async (context) => {
  const setTimeoutOriginal = globalThis.setTimeout;
  context.mock.method(globalThis, "setTimeout", (fn: () => void) => setTimeoutOriginal(fn, 1));
  const requests: RequestInit[] = [];
  context.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    requests.push(init);
    if (requests.length === 1) return new Promise<Response>(() => {});
    return Response.json({ job: { id: "job-replayed", status: "queued" }, replayed: true });
  });
  const result = await new OpenPlatformClient(env).createJob({ user: { id: 123, first_name: "Test" }, idempotencyKey: "stable-request", mode: "text-to-video", prompt: "test video" });
  assert.equal(result.replayed, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body, requests[1].body);
  assert.equal(new Headers(requests[1].headers).get("Idempotency-Key"), "stable-request");
});

test("non-idempotent upload is never retried after timeout", async (context) => {
  const setTimeoutOriginal = globalThis.setTimeout;
  context.mock.method(globalThis, "setTimeout", (fn: () => void) => setTimeoutOriginal(fn, 1));
  let calls = 0;
  context.mock.method(globalThis, "fetch", async () => { calls += 1; return new Promise<Response>(() => {}); });
  await assert.rejects(new OpenPlatformClient(env).upload({ id: 123, first_name: "Test" }, "test.png", "image/png", "test"), { code: "request_timeout" });
  assert.equal(calls, 1);
});
