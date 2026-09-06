import { HttpError, type Env } from "./types";

export type ModelCatalogItem = {
  id: string;
  name: string;
  creditCost: number;
  modes: Array<"text-to-video" | "image-to-video">;
  durations: number[];
  aspectRatios: string[];
  qualities: string[];
  supportsAudio: boolean;
  enabled: boolean;
};

export type ModelCatalog = {
  status: "ready";
  version: string;
  syncedAt: string;
  responseTimeMs: number;
  models: ModelCatalogItem[];
};

export type AcquisitionDimension = "source" | "campaign" | "content";

export type UserAcquisition = {
  found: boolean;
  externalUserId: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  startParam: string;
  firstSeenAt: string | null;
};

export async function fetchModelCatalog(env: Env): Promise<ModelCatalog> {
  const startedAt = Date.now();
  const payload = await platformGet(env, "/v1/models");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) invalidPlatform("模型目录响应格式无效。");
  const value = payload as Record<string, unknown>;
  if (typeof value.version !== "string" || !Array.isArray(value.models)) invalidPlatform("模型目录响应缺少版本或模型列表。");
  const models = value.models.map((item, index) => normalizeModel(item, index));
  if (!models.length) invalidPlatform("Open Platform 当前没有返回任何模型。");
  return {
    status: "ready",
    version: value.version,
    syncedAt: new Date().toISOString(),
    responseTimeMs: Date.now() - startedAt,
    models,
  };
}

export function validateGenerationAgainstCatalog(generation: {
  model: string;
  durationSeconds: number;
  aspectRatio: string;
  quality: string;
  audioEnabled: boolean;
}, catalog: ModelCatalog) {
  const model = catalog.models.find((item) => item.id === generation.model);
  if (!model) throw new HttpError(422, "model_not_found", `模型 ${generation.model} 不在 Open Platform 目录中。`);
  if (!model.enabled) throw new HttpError(422, "model_disabled", `模型 ${generation.model} 当前已停用。`);
  if (!model.durations.includes(generation.durationSeconds)) throw new HttpError(422, "unsupported_duration", `${model.name} 不支持 ${generation.durationSeconds} 秒时长。`);
  if (!model.aspectRatios.includes(generation.aspectRatio)) throw new HttpError(422, "unsupported_aspect_ratio", `${model.name} 不支持 ${generation.aspectRatio} 宽高比。`);
  if (!model.qualities.includes(generation.quality)) throw new HttpError(422, "unsupported_quality", `${model.name} 不支持 ${generation.quality} 质量。`);
  if (generation.audioEnabled && !model.supportsAudio) throw new HttpError(422, "unsupported_audio", `${model.name} 不支持生成音频。`);
  return model;
}

const ANALYTICS_EVENTS = [
  "mini_app_opened", "mini_app_bootstrap_failed", "mini_app_section_viewed", "mini_app_navigation_clicked", "locale_changed",
  "personalized_feed_loaded", "personalized_feed_failed", "personalized_feed_refreshed", "personalized_feed_retry_clicked", "personalized_feed_empty",
  "creation_templates_loaded", "creation_templates_failed", "home_category_selected", "home_item_impression", "home_item_clicked", "home_section_viewed",
  "home_item_detail_opened", "home_item_detail_loaded", "home_item_detail_failed", "home_item_detail_closed", "home_item_creator_opened",
  "home_content_selected_for_creation", "home_content_selection_cleared", "persona_selected",
  "generation_mode_selected", "generation_aspect_ratio_selected", "generation_duration_selected", "generation_image_selected", "generation_submitted", "generation_created", "generation_failed",
  "wallet_opened", "payment_terms_consent_changed", "credit_pack_selected", "subscription_plan_selected", "invoice_opened", "invoice_creation_failed", "payment_result_received", "payment_paid",
  "subscription_renewal_changed", "subscription_renewal_change_failed",
  "referral_share_clicked",
  "jobs_refreshed", "job_result_opened", "job_details_opened", "job_details_closed", "job_prompt_copied",
  "job_publish_opened", "job_publish_submitted", "job_publish_failed", "job_video_downloaded", "job_video_shared", "job_create_again_opened",
  "job_cancelled", "job_cancel_failed",
] as const;

export async function fetchMiniAppAnalytics(env: Env, from: string, to: string) {
  const configured = Boolean(env.POSTHOG_PERSONAL_API_KEY?.trim() && env.POSTHOG_PROJECT_ID?.trim() && env.POSTHOG_HOST?.trim());
  const base = { configured, from, to, fetchedAt: new Date().toISOString() };
  if (!configured) return { ...base, status: "not_configured" as const, responseTimeMs: 0, totals: {}, distributions: emptyDistributions() };

  const startedAt = Date.now();
  try {
    const range = `timestamp >= toDateTime(${sqlLiteral(`${from} 00:00:00`)}) AND timestamp < toDateTime(${sqlLiteral(`${nextDate(to)} 00:00:00`)})`;
    const names = ANALYTICS_EVENTS.map(sqlLiteral).join(", ");
    const [counts, paid, locales, personas, rankings, modes, acquisitionSources, acquisitionCampaigns, acquisitionContent] = await Promise.all([
      posthogQuery(env, `SELECT event, count() AS total FROM events WHERE ${range} AND event IN (${names}) GROUP BY event`),
      posthogQuery(env, `SELECT count() AS total FROM events WHERE ${range} AND event = 'payment_result_received' AND toString(properties.status) = 'paid'`),
      distributionQuery(env, range, "mini_app_opened", "language"),
      distributionQuery(env, range, "personalized_feed_loaded", "persona_code"),
      distributionQuery(env, range, "personalized_feed_loaded", "ranking_version"),
      distributionQuery(env, range, "generation_submitted", "mode"),
      firstTouchDistributionQuery(env, from, to, "source"),
      firstTouchDistributionQuery(env, from, to, "campaign"),
      firstTouchDistributionQuery(env, from, to, "content"),
    ]);
    const totals = Object.fromEntries(counts.map((row) => [String(row[0]), Number(row[1]) || 0]));
    return {
      ...base,
      status: "ready" as const,
      responseTimeMs: Date.now() - startedAt,
      totals: { ...totals, payment_paid: Number(totals.payment_paid || paid[0]?.[0]) || 0 },
      distributions: {
        locales: distributionRows(locales),
        personas: distributionRows(personas),
        rankings: distributionRows(rankings),
        modes: distributionRows(modes),
        acquisitionSources: distributionRows(acquisitionSources),
        acquisitionCampaigns: distributionRows(acquisitionCampaigns),
        acquisitionContent: distributionRows(acquisitionContent),
      },
    };
  } catch (error) {
    return {
      ...base,
      status: "error" as const,
      responseTimeMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message.slice(0, 300) : "PostHog 查询失败。",
      totals: {},
      distributions: emptyDistributions(),
    };
  }
}

export async function fetchAcquisitionBreakdown(env: Env, from: string, to: string, groupBy: AcquisitionDimension) {
  const rows = await firstTouchDistributionQuery(env, from, to, groupBy);
  return {
    from,
    to,
    groupBy,
    rows: rows.map((row) => ({ value: String(row[0]), newUsers: Number(row[1]) || 0 })),
  };
}

export async function fetchConversionFunnel(env: Env, from: string, to: string, source: string | null) {
  const range = analyticsRange(from, to);
  const events = ["mini_app_opened", "personalized_feed_loaded", "generation_created", "invoice_opened", "payment_paid"];
  const sourceFilter = source ? ` AND toString(properties.acquisition_source) = ${sqlLiteral(source)}` : "";
  const rows = await posthogQuery(env, `SELECT event, count(DISTINCT distinct_id) AS users FROM events WHERE ${range} AND event IN (${events.map(sqlLiteral).join(", ")})${sourceFilter} GROUP BY event`);
  const counts = new Map(rows.map((row) => [String(row[0]), Number(row[1]) || 0]));
  return {
    from,
    to,
    source: source || "all",
    steps: events.map((event) => ({ event, users: counts.get(event) || 0 })),
  };
}

export async function fetchUserAcquisition(env: Env, externalUserId: string): Promise<UserAcquisition> {
  const rows = await posthogQuery(env, `SELECT timestamp, toString(properties.acquisition_source), toString(properties.acquisition_medium), toString(properties.acquisition_campaign), toString(properties.acquisition_content), toString(properties.telegram_start_param) FROM events WHERE event = 'mini_app_opened' AND distinct_id = ${sqlLiteral(externalUserId)} ORDER BY timestamp ASC LIMIT 1`);
  const row = rows[0];
  if (!row) return { found: false, externalUserId, source: "unattributed", medium: "none", campaign: "none", content: "none", startParam: "none", firstSeenAt: null };
  return {
    found: true,
    externalUserId,
    firstSeenAt: String(row[0]),
    source: String(row[1] || "unattributed"),
    medium: String(row[2] || "none"),
    campaign: String(row[3] || "none"),
    content: String(row[4] || "none"),
    startParam: String(row[5] || "none"),
  };
}

async function distributionQuery(env: Env, range: string, event: string, property: string) {
  return posthogQuery(env, `SELECT toString(properties.${property}) AS value, count() AS total FROM events WHERE ${range} AND event = ${sqlLiteral(event)} AND notEmpty(toString(properties.${property})) GROUP BY value ORDER BY total DESC LIMIT 12`);
}

async function firstTouchDistributionQuery(env: Env, from: string, to: string, dimension: AcquisitionDimension) {
  const property = { source: "acquisition_source", campaign: "acquisition_campaign", content: "acquisition_content" }[dimension];
  const fallback = dimension === "source" ? "unattributed" : "none";
  return posthogQuery(env, `SELECT value, count() AS total FROM (SELECT distinct_id, argMin(if(empty(toString(properties.${property})), ${sqlLiteral(fallback)}, toString(properties.${property})), timestamp) AS value, min(timestamp) AS first_seen FROM events WHERE event = 'mini_app_opened' GROUP BY distinct_id) WHERE ${analyticsRange(from, to, "first_seen")} GROUP BY value ORDER BY total DESC LIMIT 20`);
}

export async function posthogQuery(env: Env, query: string): Promise<unknown[][]> {
  if (!env.POSTHOG_PERSONAL_API_KEY?.trim() || !env.POSTHOG_PROJECT_ID?.trim() || !env.POSTHOG_HOST?.trim()) {
    throw new HttpError(503, "posthog_not_configured", "PostHog 尚未连接。");
  }
  const host = normalizePosthogHost(env.POSTHOG_HOST || "");
  const projectId = encodeURIComponent(env.POSTHOG_PROJECT_ID || "");
  const response = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({ detail: response.statusText })) as { detail?: string };
    throw new Error(problem.detail || `PostHog HTTP ${response.status}`);
  }
  const payload = await response.json<{ results?: unknown[][] }>();
  if (!Array.isArray(payload.results)) throw new Error("PostHog 返回了无效查询结果。");
  return payload.results;
}

async function platformGet(env: Env, path: string) {
  const response = await fetch(`${env.OPEN_PLATFORM_BASE_URL.replace(/\/$/, "")}${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${env.OPEN_PLATFORM_API_KEY}` },
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({ message: response.statusText })) as { code?: string; message?: string };
    throw new HttpError(502, problem.code || "platform_request_failed", problem.message || "Open Platform 请求失败。");
  }
  return response.json<unknown>();
}

function normalizeModel(value: unknown, index: number): ModelCatalogItem {
  const item = object(value);
  const id = safeString(item.id);
  const name = safeString(item.name, id);
  const modes = stringArray(item.modes).filter((mode): mode is "text-to-video" | "image-to-video" => mode === "text-to-video" || mode === "image-to-video");
  const durations = numberArray(item.durations);
  const aspectRatios = stringArray(item.aspectRatios);
  const qualities = stringArray(item.qualities);
  if (!id || !name || !modes.length || !durations.length || !aspectRatios.length || !qualities.length) invalidPlatform(`第 ${index + 1} 个模型配置无效。`);
  return { id, name, creditCost: safeNumber(item.creditCost), modes, durations, aspectRatios, qualities, supportsAudio: item.supportsAudio === true, enabled: item.enabled === true };
}

function normalizePosthogHost(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("POSTHOG_HOST 必须使用 HTTPS。");
  url.pathname = "";
  url.search = "";
  url.hash = "";
  if (url.hostname === "us.i.posthog.com") url.hostname = "us.posthog.com";
  if (url.hostname === "eu.i.posthog.com") url.hostname = "eu.posthog.com";
  return url.toString().replace(/\/$/, "");
}

function sqlLiteral(value: string) { return `'${value.replaceAll("'", "''")}'`; }
function nextDate(value: string) { const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); }
function analyticsRange(from: string, to: string, field = "timestamp") { return `${field} >= toDateTime(${sqlLiteral(`${from} 00:00:00`)}) AND ${field} < toDateTime(${sqlLiteral(`${nextDate(to)} 00:00:00`)})`; }
function distributionRows(rows: unknown[][]) { return rows.map((row) => ({ value: String(row[0]), count: Number(row[1]) || 0 })); }
function emptyDistributions() { return { locales: [], personas: [], rankings: [], modes: [], acquisitionSources: [], acquisitionCampaigns: [], acquisitionContent: [] } as Record<string, Array<{ value: string; count: number }>>; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function safeString(value: unknown, fallback = "") { return typeof value === "string" ? value.slice(0, 500) : fallback; }
function safeNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function stringArray(value: unknown) { return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string"))] : []; }
function numberArray(value: unknown) { return Array.isArray(value) ? [...new Set(value.map(Number).filter(Number.isFinite))] : []; }
function invalidPlatform(message: string): never { throw new HttpError(502, "invalid_platform_response", message); }
