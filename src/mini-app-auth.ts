import type { TelegramUser } from "./types";

const encoder = new TextEncoder();

export class MiniAppAuthError extends Error {
  constructor(message = "Telegram Mini App authentication failed") {
    super(message);
  }
}

export type MiniAppAuthContext = {
  user: TelegramUser;
  startParam: string;
};

export async function validateTelegramInitData(
  initData: string,
  botToken: string,
  options: { nowSeconds?: number; maxAgeSeconds?: number } = {},
): Promise<TelegramUser> {
  return (await validateTelegramInitDataContext(initData, botToken, options)).user;
}

export async function validateTelegramInitDataContext(
  initData: string,
  botToken: string,
  options: { nowSeconds?: number; maxAgeSeconds?: number } = {},
): Promise<MiniAppAuthContext> {
  if (!initData || !botToken) throw new MiniAppAuthError();

  const params = new URLSearchParams(initData);
  const providedHash = params.get("hash") || "";
  params.delete("hash");

  if (!/^[a-f0-9]{64}$/i.test(providedHash)) throw new MiniAppAuthError();

  const entries: Array<[string, string]> = [];
  params.forEach((value, key) => entries.push([key, value]));
  const dataCheckString = entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const webAppDataKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secretKey = await crypto.subtle.sign("HMAC", webAppDataKey, encoder.encode(botToken));
  const validationKey = await crypto.subtle.importKey(
    "raw",
    secretKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signature = Uint8Array.from(providedHash.match(/.{2}/g) || [], (byte) => Number.parseInt(byte, 16));
  const valid = await crypto.subtle.verify("HMAC", validationKey, signature, encoder.encode(dataCheckString));
  if (!valid) throw new MiniAppAuthError();

  const authDate = Number.parseInt(params.get("auth_date") || "", 10);
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAgeSeconds = options.maxAgeSeconds ?? 86_400;
  if (!Number.isSafeInteger(authDate) || authDate > nowSeconds + 30 || nowSeconds - authDate > maxAgeSeconds) {
    throw new MiniAppAuthError("Telegram Mini App session expired");
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new MiniAppAuthError();

  let user: TelegramUser;
  try {
    user = JSON.parse(rawUser) as TelegramUser;
  } catch {
    throw new MiniAppAuthError();
  }

  if (!Number.isSafeInteger(user.id) || user.id <= 0) throw new MiniAppAuthError();
  const startParam = params.get("start_param") || "";
  if (startParam && !/^[a-zA-Z0-9_-]{1,100}$/.test(startParam)) throw new MiniAppAuthError();
  return { user, startParam };
}
