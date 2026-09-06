import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const origin = new URL(config.vars.PUBLIC_WORKER_URL).origin;
const attempts = 5;

async function request(path) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${origin}${path}`, {
        headers: { "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) return response;
      lastError = new Error(`${path} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw lastError;
}

const home = await request("/");
const html = await home.text();
if (!home.headers.get("content-type")?.includes("text/html")) throw new Error("Production home did not return HTML");
if (/There is nothing here yet|Powered by\s+Cloudflare/i.test(html)) throw new Error("Production home returned a Cloudflare placeholder page");

const health = await request("/health");
const healthBody = await health.json();
if (healthBody.ok !== true || healthBody.service !== config.name) throw new Error("Production health payload does not match the configured Worker");

const favicon = await request("/favicon.svg");
if (!favicon.headers.get("content-type")?.includes("image/svg+xml")) throw new Error("Production favicon has an unexpected content type");

console.log(`Production smoke check passed: ${origin}`);
