import assert from "node:assert/strict";
import test from "node:test";
import { miniAppApi } from "../src/mini-app.ts";
import type { Env } from "../src/types.ts";

const encoder = new TextEncoder();
const BOT_TOKEN = "123456:test-token-for-home-tests";

async function signedInitData() {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000) - 10),
    query_id: "AAHomeFeedQueryId",
    user: JSON.stringify({ id: 818181, first_name: "Feed", language_code: "ru" }),
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

function testEnv(): Env {
  return {
    TELEGRAM_BOT_TOKEN: BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: "local-webhook-secret",
    OPEN_PLATFORM_BASE_URL: "https://platform.invalid",
    OPEN_PLATFORM_API_KEY: "local-platform-key",
    OPEN_PLATFORM_CALLBACK_SECRET: "local-callback-secret",
    PUBLIC_WORKER_URL: "https://worker.invalid",
    DEFAULT_MODEL: "test-model",
  };
}

class MemoryKv {
  readonly values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async put(key: string, value: string) { this.values.set(key, value); }
}

test("Mini App home forwards only a validated personaCode selected from the API-key catalog", async (context) => {
  const originalFetch = globalThis.fetch;
  let platformUrl = "";
  let platformAuthorization = "";
  context.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input, init) => {
    platformUrl = String(input);
    platformAuthorization = new Headers(init?.headers).get("Authorization") || "";
    return Response.json({
      schemaVersion: 2,
      personaCode: "creator",
      feedSessionId: "feed-session-818181",
      rankingVersion: "seeded-shuffle-v1",
      banners: [],
      categories: [],
      sections: [],
    });
  };

  const response = await miniAppApi(new Request("https://worker.invalid/api/home?locale=ru&feedSessionId=feed-session-818181&persona=attacker&personaCode=creator", {
    headers: { Authorization: `tma ${await signedInitData()}` },
  }), testEnv());

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(platformUrl, "https://platform.invalid/v1/home?locale=ru&feedSessionId=feed-session-818181&personaCode=creator");
  assert.equal(platformAuthorization, "Bearer local-platform-key");
  assert.equal((await response.json() as { personaCode: string }).personaCode, "creator");
});

test("Mini App home rejects invalid feed sessions before contacting the platform", async () => {
  const response = await miniAppApi(new Request("https://worker.invalid/api/home?locale=en&feedSessionId=bad!", {
    headers: { Authorization: `tma ${await signedInitData()}` },
  }), testEnv());
  assert.equal(response.status, 400);
  assert.equal((await response.json() as { code: string }).code, "invalid_feed_session");
});

test("Mini App rejects malformed persona codes before contacting the platform", async (context) => {
  const originalFetch = globalThis.fetch;
  let contactedPlatform = false;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => {
    contactedPlatform = true;
    return Response.json({});
  };

  const response = await miniAppApi(new Request("https://worker.invalid/api/home?locale=en&feedSessionId=feed-session-818181&personaCode=creator%2F..", {
    headers: { Authorization: `tma ${await signedInitData()}` },
  }), testEnv());
  assert.equal(response.status, 400);
  assert.equal((await response.json() as { code: string }).code, "invalid_persona");
  assert.equal(contactedPlatform, false);
});

test("Mini App content detail stays behind Telegram auth and the server-side platform key", async (context) => {
  const originalFetch = globalThis.fetch;
  let platformUrl = "";
  let platformAuthorization = "";
  context.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input, init) => {
    platformUrl = String(input);
    platformAuthorization = new Headers(init?.headers).get("Authorization") || "";
    return Response.json({ content: {
      id: "template-safe-1", kind: "template", title: "Safe template", canCreate: true,
      requiresImage: false, requiredImageCount: 0, promptDisplay: "Public prompt",
      prompt: "Editable platform prompt",
      previewUrl: "https://cdn.invalid/safe.jpg",
      referenceImageUrl: "https://cdn.invalid/reference.jpg",
      defaultReferenceImageUrl: "https://cdn.invalid/default-reference.jpg",
      defaultReferenceEnabled: true,
      videoUrl: "http://127.0.0.1:8087/private.mp4",
    } });
  };

  const response = await miniAppApi(new Request("https://worker.invalid/api/content/template/template-safe-1?locale=ru&personaCode=creator", {
    headers: { Authorization: `tma ${await signedInitData()}` },
  }), testEnv());

  assert.equal(response.status, 200);
  assert.equal(platformUrl, "https://platform.invalid/v1/content/template/template-safe-1?locale=ru&personaCode=creator");
  assert.equal(platformAuthorization, "Bearer local-platform-key");
  const content = (await response.json() as { content: { prompt?: string; promptDisplay: string; previewUrl?: string; referenceImageUrl?: string; defaultReferenceImageUrl?: string; defaultReferenceEnabled?: boolean; videoUrl?: string } }).content;
  assert.equal(content.prompt, "Editable platform prompt");
  assert.equal(content.promptDisplay, "Public prompt");
  assert.equal(content.previewUrl, "https://cdn.invalid/safe.jpg");
  assert.equal(content.referenceImageUrl, "https://cdn.invalid/reference.jpg");
  assert.equal(content.defaultReferenceImageUrl, "https://cdn.invalid/default-reference.jpg");
  assert.equal(content.defaultReferenceEnabled, true);
  assert.equal(content.videoUrl, undefined);
});

test("Mini App jobs expose all safe creation data without leaking platform identifiers", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async () => Response.json({ jobs: [{
    id: "job-safe-1",
    clientId: "secret-client",
    userId: "secret-user",
    externalUserId: "telegram_818181",
    providerJobId: "provider-secret",
    requestKey: "request-secret",
    status: "succeeded",
    progress: 100,
    mode: "image-to-video",
    prompt: "Public user prompt",
    quality: "standard",
    durationSeconds: 5,
    aspectRatio: "9:16",
    model: "peach-max",
    providerModel: "peach-max-v2",
    seed: "53446c1fb5",
    creditCost: 300,
    audioEnabled: false,
    imageUrl: "http://127.0.0.1/private.jpg",
    coverUrl: "https://cdn.invalid/result-cover.jpg",
    thumbnailUrl: "http://127.0.0.1/private-thumbnail.jpg",
    outputUrl: "https://cdn.invalid/result.mp4",
    createdAt: "2026-08-05T01:00:00.000Z",
    updatedAt: "2026-08-05T01:01:00.000Z",
    completedAt: "2026-08-05T01:01:00.000Z",
    creditsRefunded: false,
    sourceContentKind: "template",
    sourceContentId: "portrait-safe",
  }] });

  const response = await miniAppApi(new Request("https://worker.invalid/api/jobs", {
    headers: { Authorization: `tma ${await signedInitData()}` },
  }), testEnv());
  assert.equal(response.status, 200);
  const job = (await response.json() as { jobs: Array<Record<string, unknown>> }).jobs[0];
  assert.equal(job.prompt, "Public user prompt");
  assert.equal(job.providerModel, "peach-max-v2");
  assert.equal(job.seed, "53446c1fb5");
  assert.equal(job.outputUrl, "https://cdn.invalid/result.mp4");
  assert.equal(job.coverUrl, "https://cdn.invalid/result-cover.jpg");
  assert.equal(job.thumbnailUrl, undefined);
  assert.equal(job.imageUrl, undefined);
  for (const privateField of ["clientId", "userId", "externalUserId", "providerJobId", "requestKey", "idempotencyKey"]) {
    assert.equal(privateField in job, false, `${privateField} must remain private`);
  }
});

test("Mini App validates and forwards selected model aspect ratio and duration", async (context) => {
  const originalFetch = globalThis.fetch;
  const generationBodies: Array<Record<string, unknown>> = [];
  context.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/v1/models")) {
      return Response.json({
        version: "test-catalog",
        models: [{ id: "test-model", name: "Test Model", creditCost: 60, modes: ["text-to-video"], durations: [5, 10], aspectRatios: ["9:16", "16:9", "1:1"], qualities: ["standard"], supportsAudio: true, enabled: true }],
      });
    }
    if (url.endsWith("/v1/personas")) return Response.json({ primaryPersonaCode: "creator", personas: [{ personaCode: "creator", title: "Creator", primary: true }, { personaCode: "cinematic", title: "Cinematic", primary: false }] });
    if (url.endsWith("/v1/generation-jobs")) {
      const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
      generationBodies.push(body);
      return Response.json({ job: { id: "job-ratio-1", externalUserId: "telegram_818181", status: "queued", progress: 0, model: "test-model", creditCost: 60, aspectRatio: body.aspectRatio }, replayed: false });
    }
    return Response.json({ code: "not_found", message: "not found" }, { status: 404 });
  };

  const authorization = `tma ${await signedInitData()}`;
  const unsupported = await miniAppApi(new Request("https://worker.invalid/api/generation-jobs/text", {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "cinematic ocean sunrise", aspectRatio: "4:3", requestId: "request-ratio-invalid-1" }),
  }), testEnv());
  assert.equal(unsupported.status, 422);
  assert.equal((await unsupported.json() as { code: string }).code, "unsupported_aspect_ratio");
  assert.equal(generationBodies.length, 0);

  const supported = await miniAppApi(new Request("https://worker.invalid/api/generation-jobs/text", {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "cinematic ocean sunrise", aspectRatio: "16:9", requestId: "request-ratio-supported-1" }),
  }), testEnv());
  assert.equal(supported.status, 201);
  assert.equal(generationBodies.length, 1);
  assert.equal(generationBodies[0].aspectRatio, "16:9");

  const unsupportedDuration = await miniAppApi(new Request("https://worker.invalid/api/generation-jobs/text", {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "cinematic ocean sunrise", durationSeconds: 12, requestId: "request-duration-invalid-1" }),
  }), testEnv());
  assert.equal(unsupportedDuration.status, 422);
  assert.equal((await unsupportedDuration.json() as { code: string }).code, "unsupported_duration");
  assert.equal(generationBodies.length, 1);

  const supportedDuration = await miniAppApi(new Request("https://worker.invalid/api/generation-jobs/text", {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "cinematic ocean sunrise", durationSeconds: 10, requestId: "request-duration-supported-1" }),
  }), testEnv());
  assert.equal(supportedDuration.status, 201);
  assert.equal(generationBodies.length, 2);
  assert.equal(generationBodies[1].durationSeconds, 10);
});

test("Mini App bootstrap exposes the active model aspect ratios and credit cost", async (context) => {
  const originalFetch = globalThis.fetch;
  let userCreated = false;
  context.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/v1/users")) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      userCreated = true;
      return Response.json({ user: {}, wallet: { balance: 700, version: 1 } });
    }
    if (url.includes("/v1/generation-jobs?")) {
      assert.equal(userCreated, true, "new user must exist before listing jobs");
      return Response.json({ jobs: [] });
    }
    if (url.endsWith("/v1/models")) {
      return Response.json({
        version: "test-catalog",
        models: [{ id: "test-model", name: "Test Model", creditCost: 60, modes: ["text-to-video"], durations: [5, 10], aspectRatios: ["16:9", "1:1", "9:16"], qualities: ["standard"], supportsAudio: true, enabled: true }],
      });
    }
    if (url.endsWith("/v1/personas")) return Response.json({ primaryPersonaCode: "creator", personas: [{ personaCode: "creator", title: "Creator", primary: true }, { personaCode: "cinematic", title: "Cinematic", primary: false }] });
    return Response.json({ code: "not_found", message: "not found" }, { status: 404 });
  };

  const response = await miniAppApi(new Request("https://worker.invalid/api/bootstrap", {
    headers: { Authorization: `tma ${await signedInitData()}` },
  }), testEnv());
  assert.equal(response.status, 200);
  const body = await response.json() as { primaryPersonaCode: string; personas: Array<{ personaCode: string }>; generation: { aspectRatio: string; aspectRatios: string[]; durationOptions: number[]; creditCost: number | null } };
  assert.equal(body.primaryPersonaCode, "creator");
  assert.deepEqual(body.personas.map((persona) => persona.personaCode), ["creator", "cinematic"]);
  assert.equal(body.generation.aspectRatio, "9:16");
  assert.deepEqual(body.generation.aspectRatios, ["9:16", "16:9", "1:1"]);
  assert.deepEqual(body.generation.durationOptions, [5, 10]);
  assert.equal(body.generation.creditCost, 60);
});

test("Mini App bootstrap claims a signed configurable new-user gift and returns the credited wallet", async (context) => {
  const originalFetch = globalThis.fetch;
  const adminRequests: Array<{ path: string; signature: string; body: Record<string, unknown> }> = [];
  context.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/v1/users")) return Response.json({ user: {}, wallet: { balance: 0, version: 1 } });
    if (url.includes("/v1/generation-jobs?")) return Response.json({ jobs: [] });
    if (url.endsWith("/v1/models")) return Response.json({ version: "test", models: [] });
    if (url.endsWith("/v1/personas")) return Response.json({ primaryPersonaCode: "creator", personas: [{ personaCode: "creator", title: "Creator", primary: true }] });
    return Response.json({ code: "not_found", message: "not found" }, { status: 404 });
  };

  const adminService = {
    fetch: async (request: Request) => {
      const url = new URL(request.url);
      if (url.pathname === "/api/public/v1/configuration") return Response.json({ configuration: {} });
      const body = await request.json<Record<string, unknown>>().catch(() => ({}));
      adminRequests.push({ path: url.pathname, signature: request.headers.get("X-Admin-Signature") || "", body });
      if (url.pathname === "/api/ingest/v1/events") return Response.json({ applied: true });
      if (url.pathname === "/api/ingest/v1/new-user-gifts") {
        return Response.json({ gift: { eligible: true, applied: true, credits: 300, wallet: { balance: 300, version: 2 } } });
      }
      return Response.json({ message: "not found" }, { status: 404 });
    },
  } as unknown as Fetcher;
  const env = { ...testEnv(), ADMIN_SERVICE: adminService, ADMIN_SYNC_SECRET: "signed-gift-test-secret" };

  const response = await miniAppApi(new Request("https://worker.invalid/api/bootstrap", {
    headers: { Authorization: `tma ${await signedInitData()}` },
  }), env);
  assert.equal(response.status, 200);
  const body = await response.json() as { wallet: { balance: number; version: number }; newUserGift: { credits: number; grantedNow: boolean } };
  assert.deepEqual(body.wallet, { balance: 300, version: 2 });
  assert.deepEqual(body.newUserGift, { credits: 300, grantedNow: true });
  const claim = adminRequests.find((request) => request.path === "/api/ingest/v1/new-user-gifts");
  assert.equal(claim?.body.externalUserId, "telegram_818181");
  assert.match(claim?.signature || "", /^sha256=[a-f0-9]{64}$/);
});

test("Mini App keeps configured duration options when the model catalog is unavailable", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/v1/users")) return Response.json({ user: {}, wallet: { balance: 700, version: 1 } });
    if (url.includes("/v1/generation-jobs?")) return Response.json({ jobs: [] });
    if (url.endsWith("/v1/models")) return Response.json({ code: "upstream_unavailable", message: "not available" }, { status: 503 });
    if (url.endsWith("/v1/personas")) return Response.json({ primaryPersonaCode: "creator", personas: [{ personaCode: "creator", title: "Creator", primary: true }] });
    return Response.json({ code: "not_found", message: "not found" }, { status: 404 });
  };

  const response = await miniAppApi(new Request("https://worker.invalid/api/bootstrap", {
    headers: { Authorization: `tma ${await signedInitData()}` },
  }), testEnv());
  assert.equal(response.status, 200);
  const body = await response.json() as { generation: { creditCost: number | null; durationOptions: number[] } };
  assert.equal(body.generation.creditCost, null);
  assert.deepEqual(body.generation.durationOptions, [5, 10]);
});

test("Mini App creation template feed exposes only provider-supported single-image templates", async (context) => {
  const originalFetch = globalThis.fetch;
  const platformUrls: string[] = [];
  context.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input) => {
    const url = String(input);
    platformUrls.push(url);
    const id = decodeURIComponent(url.match(/\/v1\/content\/template\/([^?]+)/)?.[1] || "");
    if (id === "cinematic-portrait") {
      return Response.json({ content: {
        id, kind: "template", title: "Cinematic Portrait", canCreate: true,
        requiresImage: true, requiredImageCount: 1, previewUrl: "https://cdn.invalid/cinematic.jpg",
      } });
    }
    if (id === "cover-shot") {
      return Response.json({ content: {
        id, kind: "template", title: "Cover Shot", canCreate: true,
        requiresImage: true, requiredImageCount: 2,
      } });
    }
    return Response.json({ content: {
      id, kind: "template", title: id, canCreate: false, requiresImage: false, requiredImageCount: 0,
    } });
  };

  const response = await miniAppApi(new Request("https://worker.invalid/api/creation-templates?locale=en&personaCode=creator", {
    headers: { Authorization: `tma ${await signedInitData()}` },
  }), testEnv());

  assert.equal(response.status, 200);
  assert.equal(platformUrls.length, 5);
  assert.ok(platformUrls.every((url) => url.includes("/v1/content/template/") && url.endsWith("?locale=en&personaCode=creator")));
  const body = await response.json() as { templates: Array<{ id: string; canCreate: boolean; requiredImageCount: number }> };
  assert.deepEqual(body.templates.map((template) => template.id), ["cinematic-portrait"]);
  assert.equal(body.templates[0].canCreate, true);
  assert.equal(body.templates[0].requiredImageCount, 1);
});

test("Mini App creates a text-capable template with a user-bound idempotency key", async (context) => {
  const originalFetch = globalThis.fetch;
  const platformRequests: Array<{ url: string; body: Record<string, unknown> }> = [];
  let contentRequestUrl = "";
  context.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/v1/content/template/")) {
      contentRequestUrl = url;
      return Response.json({ content: { id: "template-safe-1", kind: "template", title: "Safe", canCreate: true, requiresImage: false, requiredImageCount: 0 } });
    }
    const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    platformRequests.push({ url, body });
    return Response.json({ job: { id: "job-template-1", externalUserId: "telegram_818181", status: "queued", progress: 0, model: "test-model", creditCost: 60 }, replayed: false });
  };

  const requestId = "request-template-123456";
  const response = await miniAppApi(new Request("https://worker.invalid/api/content/template/template-safe-1/generation-jobs/text", {
    method: "POST",
    headers: { Authorization: `tma ${await signedInitData()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "warmer sunset", requestId, personaCode: "cinematic" }),
  }), testEnv());

  assert.equal(response.status, 201);
  assert.equal(platformRequests.length, 1);
  assert.equal(contentRequestUrl, "https://platform.invalid/v1/content/template/template-safe-1?locale=ru&personaCode=cinematic");
  assert.equal(platformRequests[0].url, "https://platform.invalid/v1/templates/template-safe-1/generation-jobs");
  assert.equal(platformRequests[0].body.externalUserId, "telegram_818181");
  assert.equal(platformRequests[0].body.idempotencyKey, `telegram-mini-app-818181-${requestId}`);
  assert.equal(platformRequests[0].body.userPrompt, "warmer sunset");
  assert.equal(platformRequests[0].body.personaCode, "cinematic");
});

test("Mini App retries one transient template creation failure with the same idempotency key", async (context) => {
  const originalFetch = globalThis.fetch;
  let creationAttempts = 0;
  const idempotencyKeys: string[] = [];
  context.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/v1/content/template/")) {
      return Response.json({ content: { id: "template-retry-1", kind: "template", title: "Retry", canCreate: true, requiresImage: false, requiredImageCount: 0 } });
    }
    creationAttempts += 1;
    idempotencyKeys.push(new Headers(init?.headers).get("Idempotency-Key") || "");
    if (creationAttempts === 1) return Response.json({ code: "upstream_unavailable", message: "temporary" }, { status: 502 });
    return Response.json({ job: { id: "job-retry-1", externalUserId: "telegram_818181", status: "queued", progress: 0, model: "test-model", creditCost: 60 }, replayed: false });
  };

  const requestId = "request-retry-12345678";
  const response = await miniAppApi(new Request("https://worker.invalid/api/content/template/template-retry-1/generation-jobs/text", {
    method: "POST",
    headers: { Authorization: `tma ${await signedInitData()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "", requestId }),
  }), testEnv());

  assert.equal(response.status, 201);
  assert.equal(creationAttempts, 2);
  assert.deepEqual(idempotencyKeys, [
    `telegram-mini-app-818181-${requestId}`,
    `telegram-mini-app-818181-${requestId}`,
  ]);
});

test("Mini App uploads one user image before creating an Asset follow job", async (context) => {
  const originalFetch = globalThis.fetch;
  const platformRequests: Array<{ url: string; body: Record<string, unknown> }> = [];
  let contentRequestUrl = "";
  context.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/v1/content/asset/")) {
      contentRequestUrl = url;
      return Response.json({ content: {
        id: "asset-safe-1", kind: "asset", title: "Safe Asset", canCreate: true, requiresImage: true, requiredImageCount: 1,
        prompt: "server-owned editable prompt", defaultReferenceImageUrl: "https://cdn.invalid/default-reference.png", defaultReferenceEnabled: true,
      } });
    }
    if (url.includes("/v1/uploads?")) {
      assert.equal(new Headers(init?.headers).get("Content-Type"), "image/png");
      assert.ok(init?.body instanceof ArrayBuffer);
      return Response.json({ upload: { id: "upload-safe-1", url: "https://uploads.invalid/safe.png" } });
    }
    const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    platformRequests.push({ url, body });
    return Response.json({ job: { id: "job-asset-1", externalUserId: "telegram_818181", status: "queued", progress: 0, model: "test-model", creditCost: 60 }, replayed: false });
  };

  const requestId = "request-asset-12345678";
  const response = await miniAppApi(new Request("https://worker.invalid/api/content/asset/asset-safe-1/generation-jobs/image", {
    method: "POST",
    headers: {
      Authorization: `tma ${await signedInitData()}`,
      "Content-Type": "image/png",
      "X-File-Name": encodeURIComponent("portrait.png"),
      "X-Prompt": encodeURIComponent("slower camera"),
      "X-Request-Id": requestId,
      "X-Persona-Code": "creator",
    },
    body: new Uint8Array([137, 80, 78, 71]),
  }), testEnv());

  assert.equal(response.status, 201);
  assert.equal(platformRequests.length, 1);
  assert.equal(contentRequestUrl, "https://platform.invalid/v1/content/asset/asset-safe-1?locale=ru&personaCode=creator");
  assert.equal(platformRequests[0].url, "https://platform.invalid/v1/assets/asset-safe-1/generation-jobs");
  assert.equal(platformRequests[0].body.externalUserId, "telegram_818181");
  assert.equal(platformRequests[0].body.idempotencyKey, `telegram-mini-app-818181-${requestId}`);
  assert.equal(platformRequests[0].body.imageUrl, "https://uploads.invalid/safe.png");
  assert.equal(platformRequests[0].body.userPrompt, "slower camera");
  assert.equal(platformRequests[0].body.personaCode, "creator");
});

test("Mini App creates a 30-day subscription invoice and blocks a second active subscription", async (context) => {
  const originalFetch = globalThis.fetch;
  const telegramBodies: Array<Record<string, unknown>> = [];
  context.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("api.telegram.org") && url.endsWith("/createInvoiceLink")) {
      telegramBodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
      return Response.json({ ok: true, result: "https://t.me/$subscription-test" });
    }
    if (url.endsWith("/v1/users")) return Response.json({ user: {}, wallet: { balance: 900, version: 1 } });
    if (url.includes("/v1/generation-jobs?")) return Response.json({ jobs: [] });
    if (url.endsWith("/v1/models")) return Response.json({ version: "test", models: [] });
    if (url.endsWith("/v1/personas")) return Response.json({ primaryPersonaCode: "creator", personas: [{ personaCode: "creator", title: "Creator", primary: true }] });
    throw new Error(`Unexpected request: ${url}`);
  };

  const memory = new MemoryKv();
  const env = {
    ...testEnv(),
    USER_PREFERENCES: memory as unknown as KVNamespace,
    ADMIN_SERVICE: {
      fetch: async () => Response.json({ configuration: { subscriptionPlans: [{
        id: "pro", title: "Pro", description: "3,000 credits per cycle", stars: 650, creditsPerCycle: 3_000,
        periodSeconds: 2_592_000, status: "active", recommended: true, channels: ["Mini App"], termsVersion: "2026-08-04",
      }] } }),
    } as unknown as Fetcher,
  };
  const authorization = `tma ${await signedInitData()}`;
  const create = () => miniAppApi(new Request("https://worker.invalid/api/payments/invoice", {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ productId: "pro", productType: "subscription", termsVersion: "2026-08-04" }),
  }), env);

  const response = await create();
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { invoiceUrl: string }).invoiceUrl, "https://t.me/$subscription-test");
  assert.equal(telegramBodies.length, 1);
  assert.equal(telegramBodies[0]?.subscription_period, 2_592_000);
  assert.match(String(telegramBodies[0]?.payload), /^v4\|2026-08-04\|subscription\|pro\|telegram_818181\|mini_app\|subscription$/);

  const expiresAt = Math.floor(Date.now() / 1_000) + 2_592_000;
  await memory.put("telegram:subscription:818181", JSON.stringify({
    planId: "pro", status: "active", startedAt: new Date().toISOString(), renewedAt: new Date().toISOString(), expiresAt, lastChargeId: "charge-1",
  }));
  const blocked = await create();
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json() as { code: string }).code, "subscription_already_active");
  assert.equal(telegramBodies.length, 1);

  const bootstrap = await miniAppApi(new Request("https://worker.invalid/api/bootstrap", { headers: { Authorization: authorization } }), env);
  assert.equal(bootstrap.status, 200);
  const bootstrapBody = await bootstrap.json() as { subscriptionPlans: Array<{ id: string }>; subscription: { planId: string }; subscriptionAvailable: boolean };
  assert.deepEqual(bootstrapBody.subscriptionPlans.map((plan) => plan.id), ["pro"]);
  assert.equal(bootstrapBody.subscription.planId, "pro");
  assert.equal(bootstrapBody.subscriptionAvailable, true);
});

test("Mini App cancels and resumes Telegram Stars renewal without changing credits", async (context) => {
  const originalFetch = globalThis.fetch;
  const telegramBodies: Array<Record<string, unknown>> = [];
  context.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("api.telegram.org") && url.endsWith("/editUserStarSubscription")) {
      telegramBodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
      return Response.json({ ok: true, result: true });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const memory = new MemoryKv();
  const expiresAt = Math.floor(Date.now() / 1_000) + 12 * 86_400;
  await memory.put("telegram:subscription:818181", JSON.stringify({
    planId: "pro", status: "active", startedAt: new Date().toISOString(), renewedAt: new Date().toISOString(),
    expiresAt, lastChargeId: "charge-current", isCanceled: false,
  }));
  const env = { ...testEnv(), USER_PREFERENCES: memory as unknown as KVNamespace };
  const authorization = `tma ${await signedInitData()}`;
  const update = (action: "cancel" | "resume") => miniAppApi(new Request(`https://worker.invalid/api/subscription/${action}`, {
    method: "POST", headers: { Authorization: authorization },
  }), env);

  const canceled = await update("cancel");
  assert.equal(canceled.status, 200);
  assert.equal((await canceled.json() as { subscription: { isCanceled: boolean } }).subscription.isCanceled, true);
  assert.deepEqual(telegramBodies[0], { user_id: 818181, telegram_payment_charge_id: "charge-current", is_canceled: true });
  assert.equal(JSON.parse(memory.values.get("telegram:subscription:818181") || "{}").isCanceled, true);

  const canceledAgain = await update("cancel");
  assert.equal(canceledAgain.status, 200);
  assert.equal(telegramBodies.length, 1);

  const resumed = await update("resume");
  assert.equal(resumed.status, 200);
  assert.equal((await resumed.json() as { subscription: { isCanceled: boolean } }).subscription.isCanceled, false);
  assert.deepEqual(telegramBodies[1], { user_id: 818181, telegram_payment_charge_id: "charge-current", is_canceled: false });
  assert.equal(JSON.parse(memory.values.get("telegram:subscription:818181") || "{}").isCanceled, false);
});
