CREATE TABLE telegram_payment_orders (
  id TEXT PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  external_user_id TEXT NOT NULL,
  telegram_user_id INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  product_title TEXT NOT NULL,
  product_type TEXT NOT NULL DEFAULT 'credit_pack' CHECK (product_type IN ('credit_pack', 'subscription')),
  stars_amount INTEGER NOT NULL CHECK (stars_amount > 0),
  credits_amount INTEGER NOT NULL CHECK (credits_amount > 0),
  invoice_payload TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PRECHECKOUT_APPROVED', 'PAID', 'FAILED')),
  telegram_payment_charge_id TEXT UNIQUE,
  channel TEXT NOT NULL DEFAULT 'Mini App' CHECK (channel IN ('Bot', 'Mini App')),
  funnel_entry TEXT NOT NULL DEFAULT 'wallet',
  terms_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  precheckout_approved_at TEXT,
  paid_at TEXT,
  failed_at TEXT
);

CREATE INDEX telegram_payment_orders_user_time_idx
  ON telegram_payment_orders(external_user_id, created_at DESC);
CREATE INDEX telegram_payment_orders_status_time_idx
  ON telegram_payment_orders(status, created_at DESC);

ALTER TABLE payments ADD COLUMN order_id TEXT REFERENCES telegram_payment_orders(id);
ALTER TABLE payments ADD COLUMN invoice_payload TEXT;
ALTER TABLE payments ADD COLUMN has_affiliate INTEGER CHECK (has_affiliate IN (0, 1));
ALTER TABLE payments ADD COLUMN affiliate_type TEXT CHECK (affiliate_type IN ('user', 'chat'));
ALTER TABLE payments ADD COLUMN affiliate_peer_id TEXT;
ALTER TABLE payments ADD COLUMN affiliate_name TEXT;
ALTER TABLE payments ADD COLUMN affiliate_commission_per_mille INTEGER;
ALTER TABLE payments ADD COLUMN affiliate_amount INTEGER;
ALTER TABLE payments ADD COLUMN affiliate_nanostar_amount INTEGER;
ALTER TABLE payments ADD COLUMN telegram_credited_amount INTEGER;
ALTER TABLE payments ADD COLUMN telegram_credited_nanostar_amount INTEGER;

CREATE UNIQUE INDEX payments_order_id_idx ON payments(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX payments_affiliate_time_idx ON payments(has_affiliate, paid_at DESC);
CREATE INDEX payments_affiliate_peer_idx ON payments(affiliate_type, affiliate_peer_id, paid_at DESC);

CREATE TABLE telegram_star_transaction_events (
  event_key TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  telegram_transaction_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  nanostar_amount INTEGER NOT NULL DEFAULT 0,
  transaction_date INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing', 'unknown')),
  transaction_type TEXT,
  source_user_id TEXT,
  invoice_payload TEXT,
  affiliate_type TEXT CHECK (affiliate_type IN ('user', 'chat')),
  affiliate_user_id TEXT,
  affiliate_chat_id TEXT,
  affiliate_name TEXT,
  affiliate_commission_per_mille INTEGER,
  affiliate_amount INTEGER,
  affiliate_nanostar_amount INTEGER,
  raw_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE INDEX telegram_star_events_transaction_idx
  ON telegram_star_transaction_events(telegram_transaction_id, transaction_date DESC);
CREATE INDEX telegram_star_events_date_idx
  ON telegram_star_transaction_events(transaction_date DESC);
CREATE INDEX telegram_star_events_affiliate_idx
  ON telegram_star_transaction_events(affiliate_type, affiliate_user_id, affiliate_chat_id, transaction_date DESC);

CREATE TABLE telegram_star_sync_state (
  id TEXT PRIMARY KEY,
  last_started_at TEXT,
  last_completed_at TEXT,
  last_error TEXT,
  last_inserted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

INSERT INTO telegram_star_sync_state(id, updated_at)
VALUES ('default', '1970-01-01T00:00:00.000Z');
