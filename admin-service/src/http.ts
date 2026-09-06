import { HttpError } from "./types";

export function json(value: unknown, status = 200, extraHeaders: HeadersInit = {}) {
  const headers = new Headers(extraHeaders);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  headers.set("Strict-Transport-Security", "max-age=31536000");
  headers.set("X-Content-Type-Options", "nosniff");
  return Response.json(value, { status, headers });
}

export function problem(error: unknown) {
  if (error instanceof HttpError) return json({ code: error.code, message: error.message }, error.status);
  if (error instanceof SyntaxError) return json({ code: "invalid_json", message: "请求格式无效。" }, 400);
  console.error(JSON.stringify({ event: "admin_request_failed", error: String(error) }));
  return json({ code: "internal_error", message: "后台服务暂时不可用。" }, 500);
}

export function assertString(value: unknown, name: string, options: { min?: number; max?: number; pattern?: RegExp } = {}) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < (options.min ?? 1) || text.length > (options.max ?? 500) || (options.pattern && !options.pattern.test(text))) {
    throw new HttpError(422, "invalid_input", `${name} 格式无效。`);
  }
  return text;
}

export function assertInteger(value: unknown, name: string, min: number, max: number) {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    throw new HttpError(422, "invalid_input", `${name} 格式无效。`);
  }
  return Number(value);
}

export function secureAssetResponse(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Strict-Transport-Security", "max-age=31536000");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
