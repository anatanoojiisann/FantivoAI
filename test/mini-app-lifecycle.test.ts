import assert from "node:assert/strict";
import test from "node:test";
import { JobLifecycle } from "../web/src/job-lifecycle.ts";
import { miniAppLaunchMode, telegramContext } from "../web/src/telegram.ts";
import type { Job } from "../web/src/api.ts";

const job = (status: string, extras: Partial<Job> = {}): Job => ({ id: "job-1", status, model: "test", progress: 0, creditCost: 10, ...extras });

test("production missing Telegram context cannot select demo mode", () => {
  assert.equal(miniAppLaunchMode(false, false), "blocked");
  assert.equal(miniAppLaunchMode(true, false), "preview");
  assert.equal(miniAppLaunchMode(false, true), "telegram");
});

test("unknown platform does not discard initData before server validation", (context) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  context.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { Telegram: { WebApp: { initData: "server-must-validate", platform: "unknown" } } } });
  assert.equal(telegramContext().isTelegram, true);
});

test("completion is correlated and deduplicated across polls and page reloads", () => {
  const events: Array<{ event: string; properties: Record<string, unknown> }> = [];
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const emit = (event: string, properties: Record<string, unknown>) => { events.push({ event, properties }); };
  const lifecycle = new JobLifecycle(emit, storage);
  lifecycle.created(job("queued"), "request-123");
  lifecycle.observe([job("succeeded")]);
  assert.equal(events.length, 0, "success without output is not yet a viewable result");
  lifecycle.observe([job("succeeded", { outputUrl: "https://media.invalid/result.mp4" })]);
  const reloaded = new JobLifecycle(emit, storage);
  reloaded.observe([job("succeeded", { outputUrl: "https://media.invalid/result.mp4" })]);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "generation_succeeded");
  assert.equal(events[0].properties.request_id, "request-123");
  assert.equal(reloaded.requestId("job-1"), "request-123");
});

test("historical completed jobs are baseline; queued jobs and immediate results produce transitions", () => {
  const events: string[] = [];
  const lifecycle = new JobLifecycle((event) => { events.push(event); });
  lifecycle.observe([job("succeeded", { outputUrl: "https://media.invalid/old.mp4" })]);
  assert.equal(events.length, 0);
  lifecycle.observe([job("queued", { id: "job-2" })]);
  lifecycle.observe([job("failed", { id: "job-2", failureCode: "provider_timeout" })]);
  lifecycle.observe([job("failed", { id: "job-2" })]);
  lifecycle.created(job("succeeded", { id: "job-3", outputUrl: "https://media.invalid/new.mp4" }), "request-3");
  assert.deepEqual(events, ["generation_completion_failed", "generation_succeeded"]);
});
