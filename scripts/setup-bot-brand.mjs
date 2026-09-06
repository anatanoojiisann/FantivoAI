import { createTelegramClient } from "./lib/telegram.mjs";
import { readFileSync } from "node:fs";

const telegram = createTelegramClient(process.env.TELEGRAM_BOT_TOKEN);

const BOT_NAME = "Fantivo AI";
const avatarUrl = new URL("../web/public/assets/fantivo-bot-avatar.jpg", import.meta.url);

const bot = await telegram("getMe");
await telegram("setMyName", { name: BOT_NAME });

const avatar = new FormData();
avatar.set("photo", JSON.stringify({ type: "static", photo: "attach://avatar" }));
avatar.set("avatar", new Blob([readFileSync(avatarUrl)], { type: "image/jpeg" }), "fantivo-ai-avatar.jpg");
await telegram("setMyProfilePhoto", avatar);

const [name, photos] = await Promise.all([
  telegram("getMyName"),
  telegram("getUserProfilePhotos", { user_id: bot.id, limit: 1 }),
]);

console.log(`Bot brand configured: ${name.name} (@${bot.username}); profile photos: ${photos.total_count}`);
