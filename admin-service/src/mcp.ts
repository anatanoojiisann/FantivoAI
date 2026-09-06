import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as z from "zod/v4";
import { fetchAcquisitionBreakdown, fetchConversionFunnel, fetchMiniAppAnalytics } from "./integrations";
import { MCP_ANALYTICS_SCOPE, mcpAuthConfiguration, protectedResourceMetadata, verifyMcpBearer } from "./mcp-auth";
import type { Env } from "./types";

const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const dateRangeInput = { from: dateValue.describe("Inclusive start date in YYYY-MM-DD"), to: dateValue.describe("Inclusive end date in YYYY-MM-DD") };
const distributionItem = z.object({ value: z.string(), count: z.number() });
const analyticsAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true } as const;
const oauthSecuritySchemes = [{ type: "oauth2", scopes: [MCP_ANALYTICS_SCOPE] }] as const;
const oauthMeta = {
  securitySchemes: oauthSecuritySchemes,
} as const;

export async function handleMcpRequest(request: Request, env: Env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: mcpCorsHeaders() });
  }
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > 65_536) return Response.json({ error: "MCP request is too large." }, { status: 413 });

  const url = new URL(request.url);
  const authConfiguration = mcpAuthConfiguration(env);
  const canonicalUrl = authConfiguration ? new URL(authConfiguration.resourceUrl) : url;
  const resourceMetadataUrl = `${canonicalUrl.origin}/.well-known/oauth-protected-resource`;
  const authInfo = await verifyMcpBearer(request, env).catch(() => null);
  const server = createPosthogMcpServer(env, resourceMetadataUrl);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    allowedHosts: [canonicalUrl.host],
    enableDnsRebindingProtection: true,
  });
  await server.connect(transport);
  const transportResponse = await transport.handleRequest(request, { ...(authInfo ? { authInfo } : {}) });
  const response = await addChatGptSecuritySchemes(transportResponse);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  mcpCorsHeaders().forEach((value, name) => headers.set(name, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function mcpMetadataResponse(env: Env) {
  const metadata = protectedResourceMetadata(env);
  if (!metadata) return Response.json({ error: "MCP OAuth is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json(metadata, { headers: { "Cache-Control": "public, max-age=300" } });
}

function createPosthogMcpServer(env: Env, resourceMetadataUrl: string) {
  const server = new McpServer(
    { name: "fantivo-posthog-analytics", version: "1.0.0" },
    { instructions: "Read-only Fantivo PostHog analytics. Use aggregate tools only. Never request or expose Telegram IDs, usernames, prompts, media, access tokens, or arbitrary HogQL. Date ranges are limited to 93 days." },
  );

  server.registerTool("get_posthog_overview", {
    title: "Get PostHog analytics overview",
    description: "Use this when the user asks for a PostHog KPI overview, event totals, acquisition summary, or general Mini App performance for a date range.",
    inputSchema: dateRangeInput,
    outputSchema: {
      configured: z.boolean(), status: z.enum(["ready", "not_configured", "error"]), from: z.string(), to: z.string(), fetchedAt: z.string(), responseTimeMs: z.number(),
      error: z.string().optional(), totals: z.record(z.string(), z.number()),
      distributions: z.object({
        locales: z.array(distributionItem), personas: z.array(distributionItem), rankings: z.array(distributionItem), modes: z.array(distributionItem),
        acquisitionSources: z.array(distributionItem), acquisitionCampaigns: z.array(distributionItem), acquisitionContent: z.array(distributionItem),
      }),
    },
    annotations: analyticsAnnotations,
    _meta: { ...oauthMeta, "openai/toolInvocation/invoking": "Reading PostHog overview…", "openai/toolInvocation/invoked": "PostHog overview loaded" },
  }, async ({ from, to }, extra) => withAuthorizedAnalytics(env, extra.authInfo, resourceMetadataUrl, async () => {
    assertDateRange(from, to);
    return fetchMiniAppAnalytics(env, from, to);
  }));

  server.registerTool("get_posthog_acquisition_breakdown", {
    title: "Get PostHog acquisition breakdown",
    description: "Use this when the user asks where new users came from or wants first-touch acquisition grouped by source, campaign, or content creative.",
    inputSchema: { ...dateRangeInput, group_by: z.enum(["source", "campaign", "content"]) },
    outputSchema: { from: z.string(), to: z.string(), groupBy: z.enum(["source", "campaign", "content"]), rows: z.array(z.object({ value: z.string(), newUsers: z.number() })) },
    annotations: analyticsAnnotations,
    _meta: { ...oauthMeta, "openai/toolInvocation/invoking": "Reading acquisition data…", "openai/toolInvocation/invoked": "Acquisition data loaded" },
  }, async ({ from, to, group_by }, extra) => withAuthorizedAnalytics(env, extra.authInfo, resourceMetadataUrl, async () => {
    assertDateRange(from, to);
    return fetchAcquisitionBreakdown(env, from, to, group_by);
  }));

  server.registerTool("get_posthog_conversion_funnel", {
    title: "Get PostHog conversion funnel",
    description: "Use this when the user asks about unique-user conversion from Mini App open through feed, generation, invoice, and paid events, optionally for one acquisition source.",
    inputSchema: { ...dateRangeInput, source: z.string().regex(/^[a-z0-9._-]{1,64}$/).nullable().optional().describe("Acquisition source, or null for all sources") },
    outputSchema: { from: z.string(), to: z.string(), source: z.string(), steps: z.array(z.object({ event: z.string(), users: z.number() })) },
    annotations: analyticsAnnotations,
    _meta: { ...oauthMeta, "openai/toolInvocation/invoking": "Reading conversion funnel…", "openai/toolInvocation/invoked": "Conversion funnel loaded" },
  }, async ({ from, to, source }, extra) => withAuthorizedAnalytics(env, extra.authInfo, resourceMetadataUrl, async () => {
    assertDateRange(from, to);
    return fetchConversionFunnel(env, from, to, source || null);
  }));

  return server;
}

async function withAuthorizedAnalytics<T extends Record<string, unknown>>(env: Env, authInfo: AuthInfo | undefined, resourceMetadataUrl: string, operation: () => Promise<T>) {
  if (!mcpAuthConfiguration(env)) {
    return { content: [{ type: "text" as const, text: "ChatGPT PostHog access is not configured on the server." }], isError: true };
  }
  if (!authInfo?.scopes.includes(MCP_ANALYTICS_SCOPE)) return oauthChallenge(resourceMetadataUrl);
  try {
    const value = await operation();
    return { structuredContent: value, content: [{ type: "text" as const, text: JSON.stringify(value) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "PostHog analytics request failed.";
    return { content: [{ type: "text" as const, text: message }], isError: true };
  }
}

function oauthChallenge(resourceMetadataUrl: string) {
  return {
    content: [{ type: "text" as const, text: "Connect the Fantivo PostHog Analytics app to continue." }],
    _meta: {
      "mcp/www_authenticate": [`Bearer resource_metadata="${resourceMetadataUrl}", error="invalid_token", error_description="OAuth login with analytics.read is required"`],
    },
    isError: true,
  };
}

function assertDateRange(from: string, to: string) {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  const days = Math.floor((end - start) / 86_400_000) + 1;
  if (!Number.isFinite(days) || days < 1 || days > 93) throw new Error("PostHog date range must be between 1 and 93 days.");
}

function parseIsoDate(value: string) {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new Error("PostHog dates must be valid calendar dates in YYYY-MM-DD format.");
  }
  return timestamp;
}

function mcpCorsHeaders() {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID",
    "Access-Control-Expose-Headers": "MCP-Protocol-Version, MCP-Session-Id",
  });
}

async function addChatGptSecuritySchemes(response: Response) {
  if (!response.headers.get("Content-Type")?.includes("application/json")) return response;
  const payload = await response.clone().json<Record<string, unknown>>().catch(() => null);
  const result = payload?.result;
  if (!result || typeof result !== "object" || !Array.isArray((result as { tools?: unknown }).tools)) return response;
  const tools = (result as { tools: Array<Record<string, unknown>> }).tools;
  for (const tool of tools) tool.securitySchemes = oauthSecuritySchemes;
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  return Response.json(payload, { status: response.status, statusText: response.statusText, headers });
}
