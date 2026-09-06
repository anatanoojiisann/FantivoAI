// Shared transport for the explicit Bot setup scripts; importing it has no side effects.
export function createTelegramClient(token) {
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");

  return async function telegram(method, body = {}) {
    const multipart = body instanceof FormData;
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      ...(multipart ? {} : { headers: { "Content-Type": "application/json" } }),
      body: multipart ? body : JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.description || `${method} failed`);
    return payload.result;
  };
}
