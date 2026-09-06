import assert from "node:assert/strict";
import test from "node:test";
import worker from "../legacy-redirect/src/index.mjs";

test("legacy Worker redirects old Mini App paths and queries to the stable production Worker", async () => {
  const response = await worker.fetch(
    new Request("https://aurax-ai-bot.example.workers.dev/create?lang=en"),
    { TARGET_ORIGIN: "https://fantivo-ai-bot.aurax-ai-telegram-bot.workers.dev" },
  );

  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://fantivo-ai-bot.aurax-ai-telegram-bot.workers.dev/create?lang=en");
});
