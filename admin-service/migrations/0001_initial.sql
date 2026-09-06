PRAGMA foreign_keys = ON;

CREATE TABLE users (
  external_user_id TEXT PRIMARY KEY,
  telegram_id INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  language_code TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'generation_restricted', 'disabled')),
  first_channel TEXT NOT NULL DEFAULT 'Bot' CHECK (first_channel IN ('Bot', 'Mini App')),
  joined_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL
);

CREATE INDEX users_last_active_idx ON users(last_active_at DESC);

CREATE TABLE wallets (
  external_user_id TEXT PRIMARY KEY REFERENCES users(external_user_id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TEXT NOT NULL
);

CREATE TABLE wallet_entries (
  id TEXT PRIMARY KEY,
  external_user_id TEXT NOT NULL REFERENCES users(external_user_id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('payment', 'generation', 'refund', 'gift', 'manual_adjustment')),
  delta INTEGER NOT NULL,
  balance_before INTEGER NOT NULL CHECK (balance_before >= 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  reference_id TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX wallet_entries_user_time_idx ON wallet_entries(external_user_id, created_at DESC);

CREATE TABLE wallet_adjustments (
  reference_id TEXT PRIMARY KEY,
  external_user_id TEXT NOT NULL REFERENCES users(external_user_id),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  balance_before INTEGER NOT NULL CHECK (balance_before >= 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  telegram_charge_id TEXT NOT NULL UNIQUE,
  external_user_id TEXT NOT NULL REFERENCES users(external_user_id),
  product_id TEXT NOT NULL,
  product_title TEXT NOT NULL,
  stars INTEGER NOT NULL CHECK (stars > 0),
  credits INTEGER NOT NULL CHECK (credits > 0),
  status TEXT NOT NULL CHECK (status IN ('credited', 'refunding', 'refunded', 'exception')),
  applied INTEGER NOT NULL CHECK (applied IN (0, 1)),
  terms_version TEXT NOT NULL,
  reconciliation TEXT NOT NULL CHECK (reconciliation IN ('matched', 'unmatched', 'duplicated', 'amount_mismatch')),
  paid_at TEXT NOT NULL,
  credited_at TEXT,
  wallet_entry_id TEXT REFERENCES wallet_entries(id)
);

CREATE INDEX payments_user_time_idx ON payments(external_user_id, paid_at DESC);

CREATE TABLE payment_refunds (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id),
  credits INTEGER NOT NULL CHECK (credits > 0),
  stars INTEGER CHECK (stars > 0),
  status TEXT NOT NULL CHECK (status IN ('requested', 'processing', 'completed', 'failed')),
  reason TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE generation_jobs (
  id TEXT PRIMARY KEY,
  external_user_id TEXT NOT NULL REFERENCES users(external_user_id),
  mode TEXT NOT NULL DEFAULT 'text-to-video' CHECK (mode IN ('text-to-video', 'image-to-video')),
  prompt TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'succeeded', 'failed', 'cancelled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  credit_cost INTEGER NOT NULL DEFAULT 0 CHECK (credit_cost >= 0),
  refunded_credits INTEGER NOT NULL DEFAULT 0 CHECK (refunded_credits >= 0),
  channel TEXT NOT NULL DEFAULT 'Bot' CHECK (channel IN ('Bot', 'Mini App')),
  duration_seconds INTEGER NOT NULL DEFAULT 5 CHECK (duration_seconds > 0),
  aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  quality TEXT NOT NULL DEFAULT 'standard',
  audio_enabled INTEGER NOT NULL DEFAULT 1 CHECK (audio_enabled IN (0, 1)),
  image_url TEXT,
  output_url TEXT,
  failure_code TEXT,
  failure_message TEXT,
  idempotency_key TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  callback_attempts INTEGER NOT NULL DEFAULT 0 CHECK (callback_attempts >= 0),
  callback_status INTEGER,
  bot_notification_status TEXT NOT NULL DEFAULT 'pending' CHECK (bot_notification_status IN ('pending', 'sent', 'failed'))
);

CREATE INDEX generation_jobs_user_time_idx ON generation_jobs(external_user_id, created_at DESC);
CREATE INDEX generation_jobs_status_time_idx ON generation_jobs(status, created_at DESC);

CREATE TABLE publications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE REFERENCES generation_jobs(id),
  external_user_id TEXT NOT NULL REFERENCES users(external_user_id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  source_cover_url TEXT,
  source_video_url TEXT NOT NULL,
  cover_key TEXT,
  video_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'published', 'rejected', 'withdrawn', 'removed')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
  reject_reason_code TEXT,
  reject_reason_text TEXT,
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT,
  published_at TEXT
);

CREATE INDEX publications_status_time_idx ON publications(status, submitted_at DESC);
CREATE INDEX publications_user_time_idx ON publications(external_user_id, submitted_at DESC);

CREATE TABLE configuration_versions (
  version TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  published_at TEXT
);

CREATE UNIQUE INDEX configuration_active_idx ON configuration_versions(status) WHERE status = 'active';

CREATE TABLE daily_metrics (
  metric_date TEXT PRIMARY KEY,
  active_users INTEGER NOT NULL DEFAULT 0,
  jobs INTEGER NOT NULL DEFAULT 0,
  succeeded_jobs INTEGER NOT NULL DEFAULT 0,
  failed_jobs INTEGER NOT NULL DEFAULT 0,
  stars INTEGER NOT NULL DEFAULT 0,
  payments INTEGER NOT NULL DEFAULT 0,
  submitted_publications INTEGER NOT NULL DEFAULT 0,
  published_publications INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE service_health (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'down')),
  success_rate REAL NOT NULL DEFAULT 0,
  p95_ms INTEGER NOT NULL DEFAULT 0,
  requests INTEGER NOT NULL DEFAULT 0,
  last_success_at TEXT NOT NULL,
  last_failure_at TEXT,
  last_error TEXT
);

CREATE TABLE ingestion_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);

INSERT INTO configuration_versions(version, status, config_json, created_at, published_at)
VALUES (
  '2026.08.04.1',
  'active',
  '{"creditPacks":[{"id":"starter","title":"Starter Pack","description":"500 credits","stars":100,"baseCredits":500,"bonusCredits":0,"status":"active","recommended":false,"channels":["Bot","Mini App"],"termsVersion":"2026-08-04"},{"id":"creator","title":"Creator Pack","description":"1,800 credits","stars":300,"baseCredits":1800,"bonusCredits":0,"status":"active","recommended":true,"channels":["Bot","Mini App"],"termsVersion":"2026-08-04"},{"id":"studio","title":"Studio Pack","description":"7,000 credits","stars":1000,"baseCredits":7000,"bonusCredits":0,"status":"active","recommended":false,"channels":["Bot","Mini App"],"termsVersion":"2026-08-04"}],"generation":{"model":"peach-max","durationSeconds":5,"aspectRatio":"9:16","quality":"standard","maxPromptLength":1000,"maxImageBytes":10485760,"maxConcurrentJobs":3,"audioEnabled":true}}',
  '2026-08-04T00:00:00.000Z',
  '2026-08-04T00:00:00.000Z'
);
