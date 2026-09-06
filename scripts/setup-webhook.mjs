import { createTelegramClient } from "./lib/telegram.mjs";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const publicWorkerUrl = process.env.PUBLIC_WORKER_URL || config.vars?.PUBLIC_WORKER_URL;
const required = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}
if (!publicWorkerUrl) throw new Error("PUBLIC_WORKER_URL is required");

const telegram = createTelegramClient(process.env.TELEGRAM_BOT_TOKEN);
const worker = publicWorkerUrl.replace(/\/$/, "");

await telegram("setWebhook", {
  url: `${worker}/telegram/webhook`,
  secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
  allowed_updates: ["message", "callback_query", "pre_checkout_query"],
  drop_pending_updates: false,
});

await telegram("setMyCommands", {
  commands: [
    { command: "start", description: "Open the main menu" },
    { command: "language", description: "Change display language" },
    { command: "app", description: "Open the AI video studio" },
    { command: "personas", description: "View available personas" },
    { command: "home", description: "Open your personalized feed" },
    { command: "generate", description: "Create video from text" },
    { command: "template", description: "Create video from a template" },
    { command: "follow", description: "Recreate an Asset with your photo" },
    { command: "balance", description: "View credits balance" },
    { command: "buy", description: "Buy credits" },
    { command: "paysupport", description: "Payment support" },
    { command: "support", description: "Customer support" },
    { command: "terms", description: "Terms of Service" },
    { command: "privacy", description: "Privacy Policy" },
    { command: "id", description: "View my Telegram ID" },
    { command: "jobs", description: "Recent jobs" },
    { command: "cancel", description: "Cancel a job" },
    { command: "help", description: "Usage help" },
  ],
});

const menuButton = {
  type: "web_app",
  text: "Open studio",
  web_app: { url: worker },
};

await telegram("setChatMenuButton", {
  menu_button: menuButton,
});

const adminChatIds = (process.env.BOT_ADMIN_TELEGRAM_IDS || "")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isSafeInteger(value) && value > 0);

for (const chatId of adminChatIds) await telegram("setChatMenuButton", {
  chat_id: chatId,
  menu_button: { type: "default" },
});

console.log(`Webhook configured: ${worker}/telegram/webhook; legacy overrides reset for ${adminChatIds.length} admin chat(s)`);
