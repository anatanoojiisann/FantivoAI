CREATE TABLE IF NOT EXISTS referral_codes (
  code TEXT PRIMARY KEY,
  external_user_id TEXT NOT NULL UNIQUE REFERENCES users(external_user_id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  inviter_user_id TEXT NOT NULL REFERENCES users(external_user_id),
  invitee_user_id TEXT NOT NULL UNIQUE REFERENCES users(external_user_id),
  code TEXT NOT NULL REFERENCES referral_codes(code),
  status TEXT NOT NULL CHECK (status IN ('registered', 'qualified', 'reward_pending', 'rewarded', 'cap_reached')),
  reward_credits INTEGER NOT NULL CHECK (reward_credits > 0),
  registered_at TEXT NOT NULL,
  qualified_at TEXT,
  rewarded_at TEXT
);
CREATE INDEX IF NOT EXISTS referrals_inviter_status_idx ON referrals(inviter_user_id, status, rewarded_at DESC);
CREATE INDEX IF NOT EXISTS referrals_invitee_idx ON referrals(invitee_user_id);

CREATE TABLE IF NOT EXISTS referral_generation_events (
  job_id TEXT PRIMARY KEY,
  invitee_user_id TEXT NOT NULL REFERENCES users(external_user_id),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS referral_reward_slots (
  id TEXT PRIMARY KEY,
  referral_id TEXT NOT NULL UNIQUE REFERENCES referrals(id),
  inviter_user_id TEXT NOT NULL REFERENCES users(external_user_id),
  reserved_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS referral_reward_slots_window_idx ON referral_reward_slots(inviter_user_id, reserved_at DESC);
