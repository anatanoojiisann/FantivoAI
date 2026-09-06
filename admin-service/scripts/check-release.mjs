import { existsSync, readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const errors = [];
const placeholder = (value) => typeof value !== "string" || !value.trim() || /replace_with|placeholder|example/i.test(value);

if (placeholder(config.d1_databases?.[0]?.database_id)) errors.push("D1 database_id 仍是占位值");
if (placeholder(config.vars?.ADMIN_USERNAME)) errors.push("后台管理员用户名尚未配置");
if (placeholder(config.vars?.MEDIA_SOURCE_HOSTS)) errors.push("外部媒体来源域名白名单尚未配置");
if (config.r2_buckets?.length) errors.push("免费部署方案不应配置 R2 Bucket");
if (placeholder(config.vars?.POSTHOG_PROJECT_ID)) errors.push("PostHog Project ID 尚未配置");
if (!/^https:\/\//.test(config.vars?.POSTHOG_HOST || "")) errors.push("PostHog API Host 必须使用 HTTPS");
if (placeholder(config.vars?.OPENAI_MODEL)) errors.push("OpenAI 模型尚未配置");
if (config.vars?.ENVIRONMENT !== "production") errors.push("ENVIRONMENT 必须是 production");
if (!["true", "false"].includes(config.vars?.ADMIN_TOTP_REQUIRED)) errors.push("ADMIN_TOTP_REQUIRED 必须显式配置为 true 或 false");
if (!config.triggers?.crons?.includes("*/10 * * * *")) errors.push("缺少 Telegram Stars 每 10 分钟同步任务");
const workerFirst = config.assets?.run_worker_first;
if (workerFirst !== true && (!Array.isArray(workerFirst) || !workerFirst.includes("/"))) errors.push("Admin 首页必须经过 Worker 注入安全响应头");
if (workerFirst !== true && (!Array.isArray(workerFirst) || !workerFirst.includes("/mcp"))) errors.push("ChatGPT MCP 路由必须优先经过 Worker");
if (workerFirst !== true && (!Array.isArray(workerFirst) || !workerFirst.includes("/.well-known/*"))) errors.push("MCP OAuth 元数据路由必须优先经过 Worker");
const mcpVars = ["MCP_RESOURCE_URL", "MCP_OAUTH_ISSUER", "MCP_OAUTH_AUDIENCE", "MCP_OAUTH_JWKS_URL"];
const configuredMcpVars = mcpVars.filter((name) => !placeholder(config.vars?.[name]));
if (configuredMcpVars.length && configuredMcpVars.length !== mcpVars.length) errors.push("ChatGPT MCP OAuth 公开变量必须一次性完整配置");
if (configuredMcpVars.length === mcpVars.length) {
  for (const name of ["MCP_RESOURCE_URL", "MCP_OAUTH_ISSUER", "MCP_OAUTH_JWKS_URL"]) {
    if (!/^https:\/\//.test(config.vars?.[name] || "")) errors.push(`${name} 必须使用 HTTPS`);
  }
  if (!String(config.vars.MCP_RESOURCE_URL).endsWith("/mcp")) errors.push("MCP_RESOURCE_URL 必须指向公开的 /mcp 端点");
}
if (!existsSync(new URL("../../admin/dist/index.html", import.meta.url))) errors.push("缺少 admin/dist，请先运行 npm run build:admin");

if (errors.length) {
  console.error("Admin Service 正式发布检查未通过：");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Admin Service 正式发布公开配置检查通过。");
