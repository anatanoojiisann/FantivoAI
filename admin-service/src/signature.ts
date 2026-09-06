import { HttpError } from "./types";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;

export async function verifyIngestSignature(secret: string, timestamp: string, body: ArrayBuffer, provided: string, now = Date.now()) {
  const timestampMs = Number(timestamp) * 1_000;
  if (!secret || !Number.isSafeInteger(timestampMs) || Math.abs(now - timestampMs) > MAX_CLOCK_SKEW_MS) return false;
  const hex = provided.startsWith("sha256=") ? provided.slice(7) : "";
  if (!/^[a-f0-9]{64}$/i.test(hex)) return false;
  const signed = signedPayload(timestamp, body);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signature = Uint8Array.from(hex.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
  return crypto.subtle.verify("HMAC", key, signature, signed);
}

export async function requireIngestSignature(request: Request, secret: string, body: ArrayBuffer) {
  const timestamp = request.headers.get("X-Admin-Timestamp") || "";
  const signature = request.headers.get("X-Admin-Signature") || "";
  if (!(await verifyIngestSignature(secret, timestamp, body, signature))) {
    throw new HttpError(401, "invalid_signature", "同步请求签名无效或已过期。");
  }
}

export async function createIngestSignature(secret: string, timestamp: string, body: ArrayBuffer) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, signedPayload(timestamp, body));
  return `sha256=${[...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function signedPayload(timestamp: string, body: ArrayBuffer) {
  const prefix = new TextEncoder().encode(`${timestamp}.`);
  const payload = new Uint8Array(prefix.byteLength + body.byteLength);
  payload.set(prefix);
  payload.set(new Uint8Array(body), prefix.byteLength);
  return payload;
}
