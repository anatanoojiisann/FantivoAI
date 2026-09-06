import { HttpError, type Env, type PublicationRow } from "./types";

const MAX_REDIRECTS = 3;
const UPSTREAM_TIMEOUT_MS = 10_000;

type MediaFamily = "video" | "image";

export async function publicMedia(request: Request, env: Env, publicationId: string, kind: "video" | "cover") {
  const publication = await env.DB.prepare("SELECT * FROM publications WHERE id = ? AND status = 'published'").bind(publicationId).first<PublicationRow>();
  if (!publication) throw new HttpError(404, "media_not_found", "内容不存在或不可公开访问。");
  const source = kind === "video" ? publication.source_video_url : publication.source_cover_url;
  if (!source) throw new HttpError(404, "media_not_found", "这个媒体文件不存在。");

  const range = request.headers.get("Range");
  if (range && !/^bytes=\d*-\d*$/.test(range)) throw new HttpError(416, "invalid_range", "媒体 Range 请求无效。");
  const family: MediaFamily = kind === "video" ? "video" : "image";
  let upstream: Response;
  try {
    upstream = await fetchAllowedSource(source, env.MEDIA_SOURCE_HOSTS, family, {
      method: request.method,
      headers: { Accept: `${family}/*`, ...(range ? { Range: range } : {}) },
    }, 502);
  } catch (error) {
    await markUnavailable(env, publicationId);
    throw error;
  }

  const contentType = mediaContentType(upstream, family, 502);
  const headers = new Headers();
  for (const name of ["Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
  headers.set("Strict-Transport-Security", "max-age=31536000");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  if (publication.media_status !== "available") await markAvailable(env, publicationId);
  return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers });
}

async function fetchAllowedSource(source: string, configuredHosts: string, family: MediaFamily, init: RequestInit, errorStatus: 422 | 502) {
  let url = allowedSourceUrl(source, configuredHosts);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    let response: Response;
    try {
      response = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    } catch {
      throw new HttpError(errorStatus, "media_source_unavailable", "媒体来源暂时不可用。");
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("Location");
      await response.body?.cancel().catch(() => undefined);
      if (!location || redirects === MAX_REDIRECTS) throw new HttpError(errorStatus, "media_redirect_invalid", "媒体来源重定向无效。");
      url = allowedSourceUrl(new URL(location, url).toString(), configuredHosts);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new HttpError(errorStatus, "media_source_unavailable", "媒体来源暂时不可用。");
    }
    try {
      mediaContentType(response, family, errorStatus);
    } catch (error) {
      await response.body?.cancel().catch(() => undefined);
      throw error;
    }
    return response;
  }
  throw new HttpError(errorStatus, "media_redirect_invalid", "媒体来源重定向无效。");
}

function mediaContentType(response: Response, family: MediaFamily, status: 422 | 502) {
  const contentType = (response.headers.get("Content-Type") || "").split(";", 1)[0].toLowerCase();
  if (!contentType.startsWith(`${family}/`)) throw new HttpError(status, "invalid_media_type", "媒体格式无效。");
  return contentType;
}

async function markUnavailable(env: Env, id: string) {
  await env.DB.prepare("UPDATE publications SET media_status = 'unavailable', media_checked_at = ? WHERE id = ? AND status = 'published'")
    .bind(new Date().toISOString(), id).run().catch(() => undefined);
}

async function markAvailable(env: Env, id: string) {
  await env.DB.prepare("UPDATE publications SET media_status = 'available', media_checked_at = ? WHERE id = ? AND status = 'published'")
    .bind(new Date().toISOString(), id).run().catch(() => undefined);
}

export function allowedSourceUrl(source: string, configuredHosts: string) {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new HttpError(422, "invalid_media_url", "媒体地址无效。");
  }
  const hosts = configuredHosts.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (url.protocol !== "https:" || !hosts.includes(url.hostname.toLowerCase())) {
    throw new HttpError(422, "media_host_not_allowed", "媒体来源域名不在允许列表中。");
  }
  url.username = "";
  url.password = "";
  return url;
}
