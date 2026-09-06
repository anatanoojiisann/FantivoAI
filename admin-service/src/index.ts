import { adminSession, loginAdmin, logoutAdmin, requireAdmin } from "./auth";
import { analyzeMiniAppAnalytics } from "./analytics-ai";
import { validateCreditPacks, validateNewUserGiftCredits, validateReferralConfiguration, validateSubscriptionPlans } from "./configuration";
import { assertInteger, assertString, json, problem, secureAssetResponse } from "./http";
import { fetchMiniAppAnalytics, fetchModelCatalog, fetchUserAcquisition, validateGenerationAgainstCatalog } from "./integrations";
import { publicMedia } from "./media";
import { handleMcpRequest, mcpMetadataResponse } from "./mcp";
import { adjustWallet, grantNewUserGift } from "./platform";
import { requireIngestSignature } from "./signature";
import { activeConfiguration, bootstrap, ingestEvent, publicationById, publicPublications, publishConfiguration } from "./store";
import { createPaymentOrder, loadPaymentOrder, markPaymentOrderFailed, markPaymentOrderPrecheckoutApproved } from "./payment-orders";
import { syncStarTransactions } from "./star-transactions";
import { telegramAffiliateAnalytics } from "./affiliate-analytics";
import { bootstrapReferral, recordSuccessfulReferralGeneration, referralDashboard } from "./referrals";
import { HttpError, type Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") {
        const database = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
        return json({ ok: database?.ok === 1, service: "aurax-admin-service" });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/v1/login") return await loginAdmin(request, env);
      if (request.method === "GET" && url.pathname === "/api/auth/v1/session") return await adminSession(request, env);
      if (request.method === "POST" && url.pathname === "/api/auth/v1/logout") return await logoutAdmin(request, env);

      if (request.method === "GET" && url.pathname === "/.well-known/oauth-protected-resource") return mcpMetadataResponse(env);
      if (url.pathname === "/mcp") return await handleMcpRequest(request, env);

      const mediaMatch = /^\/media\/([^/]+)\/(video|cover)$/.exec(url.pathname);
      if ((request.method === "GET" || request.method === "HEAD") && mediaMatch) {
        return await publicMedia(request, env, decodeURIComponent(mediaMatch[1]), mediaMatch[2] as "video" | "cover");
      }

      if (request.method === "GET" && url.pathname === "/api/public/v1/publications") {
        const limit = assertInteger(Number(url.searchParams.get("limit") || 24), "limit", 1, 100);
        const cursor = url.searchParams.get("cursor") || undefined;
        return json(await publicPublications(env.DB, limit, cursor), 200, { "Cache-Control": "public, max-age=60" });
      }

      if (request.method === "GET" && url.pathname === "/api/public/v1/configuration") {
        return json({ configuration: await activeConfiguration(env.DB) }, 200, { "Cache-Control": "public, max-age=60" });
      }

      if (request.method === "POST" && url.pathname === "/api/ingest/v1/new-user-gifts") {
        const body = await request.arrayBuffer();
        await requireIngestSignature(request, env.ADMIN_INGEST_SECRET, body);
        const input = JSON.parse(new TextDecoder().decode(body) || "{}") as { externalUserId?: unknown };
        const externalUserId = assertString(input.externalUserId, "External User ID", { min: 10, max: 40, pattern: /^telegram_\d+$/ });
        return json({ gift: await grantNewUserGift(env, externalUserId) });
      }

      if (request.method === "POST" && url.pathname === "/api/ingest/v1/referrals/bootstrap") {
        const body = await request.arrayBuffer();
        await requireIngestSignature(request, env.ADMIN_INGEST_SECRET, body);
        const input = JSON.parse(new TextDecoder().decode(body) || "{}") as { externalUserId?: unknown; startParam?: unknown };
        const externalUserId = assertString(input.externalUserId, "External User ID", { min: 10, max: 40, pattern: /^telegram_\d+$/ });
        const startParam = input.startParam === undefined ? "" : assertString(input.startParam, "startParam", { min: 0, max: 100, pattern: /^[a-zA-Z0-9_-]*$/ });
        return json({ referral: await bootstrapReferral(env, { externalUserId, startParam }) });
      }

      if (request.method === "POST" && url.pathname === "/api/ingest/v1/referrals/generation-completed") {
        const body = await request.arrayBuffer();
        await requireIngestSignature(request, env.ADMIN_INGEST_SECRET, body);
        const input = JSON.parse(new TextDecoder().decode(body) || "{}") as { externalUserId?: unknown; jobId?: unknown; occurredAt?: unknown };
        const externalUserId = assertString(input.externalUserId, "External User ID", { min: 10, max: 40, pattern: /^telegram_\d+$/ });
        const jobId = assertString(input.jobId, "Job ID", { min: 8, max: 160, pattern: /^[a-zA-Z0-9_-]+$/ });
        const occurredAt = input.occurredAt === undefined ? undefined : assertString(input.occurredAt, "occurredAt", { min: 20, max: 40 });
        return json({ result: await recordSuccessfulReferralGeneration(env, { externalUserId, jobId, occurredAt }) });
      }

      if (url.pathname === "/api/ingest/v1/payment-orders" || url.pathname.startsWith("/api/ingest/v1/payment-orders/")) {
        const body = await request.arrayBuffer();
        await requireIngestSignature(request, env.ADMIN_INGEST_SECRET, body);
        if (request.method === "POST" && url.pathname === "/api/ingest/v1/payment-orders") {
          const input = JSON.parse(new TextDecoder().decode(body) || "{}") as unknown;
          return json({ order: await createPaymentOrder(env.DB, input) }, 201);
        }
        const actionMatch = /^\/api\/ingest\/v1\/payment-orders\/([^/]+)\/(precheckout|failed)$/.exec(url.pathname);
        if (request.method === "POST" && actionMatch) {
          const orderId = decodeURIComponent(actionMatch[1]);
          const order = actionMatch[2] === "precheckout"
            ? await markPaymentOrderPrecheckoutApproved(env.DB, orderId)
            : await markPaymentOrderFailed(env.DB, orderId);
          return json({ order });
        }
        const orderMatch = /^\/api\/ingest\/v1\/payment-orders\/([^/]+)$/.exec(url.pathname);
        if (request.method === "GET" && orderMatch) return json({ order: await loadPaymentOrder(env.DB, decodeURIComponent(orderMatch[1])) });
        throw new HttpError(404, "not_found", "支付订单接口不存在。");
      }

      if (request.method === "POST" && url.pathname === "/api/ingest/v1/events") {
        const declaredLength = Number(request.headers.get("Content-Length") || 0);
        if (declaredLength > 1_048_576) throw new HttpError(413, "payload_too_large", "同步事件数据过大。");
        const body = await request.arrayBuffer();
        if (body.byteLength > 1_048_576) throw new HttpError(413, "payload_too_large", "同步事件数据过大。");
        await requireIngestSignature(request, env.ADMIN_INGEST_SECRET, body);
        const event = JSON.parse(new TextDecoder().decode(body)) as { type?: unknown; data?: { publication?: { id?: unknown } } };
        const result = await ingestEvent(env, event);
        if (event.type === "publication.submitted" && typeof event.data?.publication?.id === "string") {
          const publication = await publicationById(env.DB, event.data.publication.id);
          return json({ ...result, publication: { id: publication.id, status: publication.status, version: publication.version } }, 202);
        }
        return json(result, 202);
      }

      if (url.pathname.startsWith("/api/admin/v1/")) {
        await requireAdmin(request, env);
        return await adminApi(request, env, url);
      }

      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) {
        throw new HttpError(404, "not_found", "接口不存在。");
      }
      if ((request.method === "GET" || request.method === "HEAD") && env.ASSETS) {
        return secureAssetResponse(await env.ASSETS.fetch(request));
      }
      throw new HttpError(404, "not_found", "页面不存在。");
    } catch (error) {
      return problem(error);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, context: ExecutionContext) {
    context.waitUntil(syncStarTransactions(env).catch((error) => {
      console.error(JSON.stringify({ event: "telegram_star_transactions_sync_failed", error: String(error) }));
    }));
  },
};

async function adminApi(request: Request, env: Env, url: URL) {
  if (request.method === "GET" && url.pathname === "/api/admin/v1/bootstrap") return json(await bootstrap(env.DB, env.ENVIRONMENT));

  if ((request.method === "GET" && url.pathname === "/api/admin/v1/model-catalog")
    || (request.method === "POST" && url.pathname === "/api/admin/v1/model-catalog/sync")) {
    return json(await fetchModelCatalog(env));
  }

  if (request.method === "GET" && url.pathname === "/api/admin/v1/analytics/mini-app") {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
    const from = assertString(url.searchParams.get("from") || weekAgo, "from", { min: 10, max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ });
    const to = assertString(url.searchParams.get("to") || today, "to", { min: 10, max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ });
    if (Date.parse(`${from}T00:00:00Z`) > Date.parse(`${to}T00:00:00Z`)) throw new HttpError(422, "invalid_date_range", "开始日期不能晚于结束日期。");
    return json(await fetchMiniAppAnalytics(env, from, to));
  }

  if (request.method === "POST" && url.pathname === "/api/admin/v1/analytics/mini-app/analyze") {
    const input = await request.json<{ question?: unknown; from?: unknown; to?: unknown }>();
    const today = new Date().toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    const question = assertString(input.question, "分析问题", { min: 3, max: 600 });
    const from = assertString(input.from || monthAgo, "from", { min: 10, max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ });
    const to = assertString(input.to || today, "to", { min: 10, max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ });
    return json(await analyzeMiniAppAnalytics(env, question, from, to));
  }

  const acquisitionMatch = /^\/api\/admin\/v1\/analytics\/mini-app\/users\/([^/]+)\/acquisition$/.exec(url.pathname);
  if (request.method === "GET" && acquisitionMatch) {
    const externalUserId = decodeURIComponent(acquisitionMatch[1]);
    if (!/^telegram_\d+$/.test(externalUserId)) throw new HttpError(422, "invalid_user", "External User ID 格式无效。");
    return json(await fetchUserAcquisition(env, externalUserId));
  }

  if (request.method === "POST" && url.pathname === "/api/admin/v1/telegram-stars/sync") {
    return json({ sync: await syncStarTransactions(env) });
  }

  if (request.method === "GET" && url.pathname === "/api/admin/v1/analytics/telegram-affiliate") {
    const today = new Date().toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    const from = assertString(url.searchParams.get("from") || monthAgo, "from", { min: 10, max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ });
    const to = assertString(url.searchParams.get("to") || today, "to", { min: 10, max: 10, pattern: /^\d{4}-\d{2}-\d{2}$/ });
    if (Date.parse(`${from}T00:00:00Z`) > Date.parse(`${to}T00:00:00Z`)) throw new HttpError(422, "invalid_date_range", "开始日期不能晚于结束日期。");
    return json(await telegramAffiliateAnalytics(env.DB, from, to));
  }

  if (request.method === "GET" && url.pathname === "/api/admin/v1/referrals") return json(await referralDashboard(env.DB));

  if (request.method === "POST" && url.pathname === "/api/admin/v1/configuration-versions") {
    const input = await request.json<{ generation?: Record<string, unknown>; creditPacks?: unknown; subscriptionPlans?: unknown; newUserGiftCredits?: unknown; referral?: unknown }>();
    const generation = input.generation || {};
    const model = assertString(generation.model, "默认模型", { min: 2, max: 80, pattern: /^[a-zA-Z0-9._-]+$/ });
    const durationSeconds = assertInteger(generation.durationSeconds, "默认时长", 1, 60);
    const aspectRatio = assertString(generation.aspectRatio, "默认宽高比", { min: 3, max: 10, pattern: /^\d{1,2}:\d{1,2}$/ });
    const quality = assertString(generation.quality, "默认质量", { min: 2, max: 40, pattern: /^[a-zA-Z0-9._-]+$/ });
    const maxPromptLength = assertInteger(generation.maxPromptLength, "提示词最大长度", 100, 10_000);
    const maxImageBytes = assertInteger(generation.maxImageBytes, "图片最大尺寸", 1_048_576, 104_857_600);
    const maxConcurrentJobs = assertInteger(generation.maxConcurrentJobs, "单用户并发任务", 1, 20);
    const audioEnabled = generation.audioEnabled === true;
    const creditPacks = input.creditPacks === undefined ? undefined : validateCreditPacks(input.creditPacks);
    const subscriptionPlans = input.subscriptionPlans === undefined ? undefined : validateSubscriptionPlans(input.subscriptionPlans);
    const newUserGiftCredits = input.newUserGiftCredits === undefined ? undefined : validateNewUserGiftCredits(input.newUserGiftCredits);
    const referral = input.referral === undefined ? undefined : validateReferralConfiguration(input.referral);
    const nextGeneration = { model, durationSeconds, aspectRatio, quality, maxPromptLength, maxImageBytes, maxConcurrentJobs, audioEnabled };
    validateGenerationAgainstCatalog(nextGeneration, await fetchModelCatalog(env));
    return json({ configuration: await publishConfiguration(env.DB, nextGeneration, creditPacks, subscriptionPlans, newUserGiftCredits, referral) }, 201);
  }

  const walletMatch = /^\/api\/admin\/v1\/users\/([^/]+)\/wallet-adjustments$/.exec(url.pathname);
  if (request.method === "POST" && walletMatch) {
    const input = await request.json<{ delta?: unknown; reason?: unknown; referenceId?: unknown }>();
    const externalUserId = decodeURIComponent(walletMatch[1]);
    if (!/^telegram_\d+$/.test(externalUserId)) throw new HttpError(422, "invalid_user", "External User ID 格式无效。");
    const delta = assertInteger(input.delta, "delta", -1_000_000, 1_000_000);
    if (delta === 0) throw new HttpError(422, "invalid_delta", "调整数量不能为 0。");
    const reason = assertString(input.reason, "调整原因", { min: 4, max: 300 });
    const referenceId = assertString(input.referenceId, "Reference ID", { min: 8, max: 80, pattern: /^[a-zA-Z0-9_-]+$/ });
    return json({ user: await adjustWallet(env, externalUserId, delta, reason, referenceId) });
  }

  throw new HttpError(404, "not_found", "后台接口不存在。");
}
