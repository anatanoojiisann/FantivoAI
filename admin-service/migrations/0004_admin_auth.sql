CREATE TABLE admin_auth_state (
  username TEXT PRIMARY KEY,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  window_started_at INTEGER NOT NULL DEFAULT 0 CHECK (window_started_at >= 0),
  blocked_until INTEGER NOT NULL DEFAULT 0 CHECK (blocked_until >= 0),
  last_totp_counter INTEGER NOT NULL DEFAULT -1 CHECK (last_totp_counter >= -1),
  updated_at TEXT NOT NULL
);

PRAGMA optimize;
