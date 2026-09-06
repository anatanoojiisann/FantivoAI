import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.ts";
import { publicMedia } from "../src/media.ts";
import type { Env, PublicationRow } from "../src/types.ts";

const publication: PublicationRow = {
  id: "pub_media_test",
  job_id: "job_media_test",
  external_user_id: "telegram_900000001",
  title: "Media test",
  description: "",
  tags_json: "[]",
  source_cover_url: "https://media.example/cover.jpg",
  source_video_url: "https://media.example/video.mp4",
  cover_key: null,
  video_key: null,
  media_status: "available",
  media_checked_at: "2026-08-04T00:00:00.000Z",
  source_video_content_type: "video/mp4",
  source_video_content_length: 4,
  source_video_etag: '"media-etag"',
  source_cover_content_type: "image/jpeg",
  source_cover_content_length: 4,
  source_cover_etag: '"cover-etag"',
  status: "published",
  version: 1,
  is_featured: 0,
  reject_reason_code: null,
  reject_reason_text: null,
  submitted_at: "2026-08-04T00:00:00.000Z",
  reviewed_at: "2026-08-04T00:00:00.000Z",
  published_at: "2026-08-04T00:00:00.000Z",
};

function mediaEnv(options: { found?: boolean; row?: PublicationRow } = {}) {
  const statements: Array<{ sql: string; binds: unknown[] }> = [];
  const row = options.row || publication;
  const env = {
    DB: {
      prepare(sql: string) {
        const statement = { sql, binds: [] as unknown[] };
        statements.push(statement);
        return {
          bind(...values: unknown[]) {
            statement.binds = values;
            return {
              first: async () => options.found === false ? null : row,
              run: async () => ({ success: true }),
            };
          },
        };
      },
    },
    ENVIRONMENT: "development",
    MEDIA_SOURCE_HOSTS: "media.example",
  } as unknown as Env;
  return { env, statements };
}

test("external media proxy returns a complete response without exposing its source URL", { concurrency: false }, async (t) => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response(new Uint8Array([1, 2, 3, 4]), {
      headers: { "Content-Type": "video/mp4", "Content-Length": "4", ETag: '"media-etag"' },
    });
  });
  const { env } = mediaEnv();
  const response = await publicMedia(new Request("http://local/media/pub_media_test/video"), env, publication.id, "video");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Length"), "4");
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=300, stale-while-revalidate=60");
  assert.equal(calls[0]?.input, publication.source_video_url);
  assert.equal(response.headers.has("Location"), false);
});

test("external media HEAD forwards metadata without a body", { concurrency: false }, async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, {
    headers: { "Content-Type": "image/jpeg", "Content-Length": "4", ETag: '"cover-etag"' },
  }));
  const { env } = mediaEnv();
  const response = await publicMedia(new Request("http://local/media/pub_media_test/cover", { method: "HEAD" }), env, publication.id, "cover");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/jpeg");
  assert.equal(await response.text(), "");
});

test("external media proxy forwards one bounded Range request", { concurrency: false }, async (t) => {
  let receivedRange = "";
  t.mock.method(globalThis, "fetch", async (_input: string | URL | Request, init?: RequestInit) => {
    receivedRange = new Headers(init?.headers).get("Range") || "";
    return new Response(new Uint8Array([1, 2]), {
      status: 206,
      headers: { "Content-Type": "video/mp4", "Content-Length": "2", "Content-Range": "bytes 0-1/4", "Accept-Ranges": "bytes" },
    });
  });
  const { env } = mediaEnv();
  const request = new Request("http://local/media/pub_media_test/video", { headers: { Range: "bytes=0-1" } });
  const response = await publicMedia(request, env, publication.id, "video");
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Content-Range"), "bytes 0-1/4");
  assert.equal(receivedRange, "bytes=0-1");
});

test("media redirects cannot escape the configured host allowlist", { concurrency: false }, async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 302, headers: { Location: "https://evil.example/video.mp4" } }));
  const { env } = mediaEnv();
  await assert.rejects(() => publicMedia(new Request("http://local/media/pub_media_test/video"), env, publication.id, "video"), /媒体来源域名不在允许列表中/);
});

test("async media and admin errors use the Worker problem response", async () => {
  const missing = mediaEnv({ found: false }).env;
  const mediaResponse = await worker.fetch(new Request("http://local/media/pending/video"), missing);
  assert.equal(mediaResponse.status, 404);
  assert.equal((await mediaResponse.json<{ code: string }>()).code, "media_not_found");

  const adminResponse = await worker.fetch(new Request("http://local/api/admin/v1/users/not-a-telegram-id/wallet-adjustments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta: 1, reason: "test adjustment", referenceId: "test_reference_001" }),
  }), missing);
  assert.equal(adminResponse.status, 422);
  assert.equal((await adminResponse.json<{ code: string }>()).code, "invalid_user");
});
