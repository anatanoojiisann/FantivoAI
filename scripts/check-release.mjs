import { existsSync, readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const errors = [];
// Production identity is intentionally independent from product branding.
// Changing either value requires a two-phase migration that keeps the old
// public origin alive until Telegram clients no longer use cached menus.
const PRODUCTION_WORKER_NAME = "fantivo-ai-bot";
const PRODUCTION_PUBLIC_ORIGIN = "https://fantivo-ai-bot.aurax-ai-telegram-bot.workers.dev";
const placeholder = (value) => typeof value !== "string" || !value.trim() || /example|replace_with|placeholder|your[-_]/i.test(value);
const validHttpsUrl = (value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

if (config.name !== PRODUCTION_WORKER_NAME) errors.push(`禁止直接修改正式 Worker 名称；应保持 ${PRODUCTION_WORKER_NAME}，改名必须执行双地址迁移`);
if (placeholder(config.vars?.OPEN_PLATFORM_BASE_URL) || !validHttpsUrl(config.vars?.OPEN_PLATFORM_BASE_URL)) errors.push("OPEN_PLATFORM_BASE_URL 尚未配置为正式 HTTPS 地址");
if (placeholder(config.vars?.PUBLIC_WORKER_URL) || !validHttpsUrl(config.vars?.PUBLIC_WORKER_URL)) errors.push("PUBLIC_WORKER_URL 尚未配置为正式 HTTPS 地址");
if (typeof config.vars?.PUBLIC_WORKER_URL === "string" && config.vars.PUBLIC_WORKER_URL.replace(/\/$/, "") !== PRODUCTION_PUBLIC_ORIGIN) {
  errors.push(`PUBLIC_WORKER_URL 与锁定的正式入口不一致；应保持 ${PRODUCTION_PUBLIC_ORIGIN}，换域名必须先保留旧入口跳转`);
}
if (config.vars?.OPEN_PLATFORM_CALLBACK_URL && !validHttpsUrl(config.vars.OPEN_PLATFORM_CALLBACK_URL)) errors.push("OPEN_PLATFORM_CALLBACK_URL 必须是正式 HTTPS 地址，或在未登记回调 Host 时删除该配置");
if (!config.vars?.DEFAULT_MODEL) errors.push("DEFAULT_MODEL 未配置");
if (!existsSync(new URL("../web/public/terms.html", import.meta.url))) errors.push("缺少服务条款页面");
if (!existsSync(new URL("../web/public/privacy.html", import.meta.url))) errors.push("缺少隐私政策页面");

if (errors.length) {
  console.error("正式发布检查未通过：");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("正式发布公开配置检查通过。");
