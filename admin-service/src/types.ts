export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ENVIRONMENT: "development" | "production";
  ADMIN_INGEST_SECRET: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD_HASH: string;
  ADMIN_TOTP_SECRET: string;
  ADMIN_TOTP_REQUIRED?: string;
  ADMIN_SESSION_SECRET: string;
  TELEGRAM_BOT_TOKEN: string;
  OPEN_PLATFORM_BASE_URL: string;
  OPEN_PLATFORM_API_KEY: string;
  POSTHOG_PERSONAL_API_KEY?: string;
  POSTHOG_PROJECT_ID?: string;
  POSTHOG_HOST?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  MCP_RESOURCE_URL?: string;
  MCP_OAUTH_ISSUER?: string;
  MCP_OAUTH_AUDIENCE?: string;
  MCP_OAUTH_JWKS_URL?: string;
  MCP_ALLOWED_SUBJECTS?: string;
  MEDIA_SOURCE_HOSTS: string;
}

export type IngestEvent = {
  eventId: string;
  type: "user.upsert" | "wallet.snapshot" | "payment.credited" | "job.upsert" | "jobs.snapshot" | "publication.submitted" | "service.health";
  occurredAt: string;
  data: Record<string, unknown>;
};

export type PublicationRow = {
  id: string;
  job_id: string;
  external_user_id: string;
  title: string;
  description: string;
  tags_json: string;
  source_cover_url: string | null;
  source_video_url: string;
  cover_key: string | null;
  video_key: string | null;
  media_status: "unchecked" | "available" | "unavailable";
  media_checked_at: string | null;
  source_video_content_type: string | null;
  source_video_content_length: number | null;
  source_video_etag: string | null;
  source_cover_content_type: string | null;
  source_cover_content_length: number | null;
  source_cover_etag: string | null;
  status: "pending_review" | "published" | "rejected" | "withdrawn" | "removed";
  version: number;
  is_featured: number;
  reject_reason_code: string | null;
  reject_reason_text: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  published_at: string | null;
};

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}
