ALTER TABLE payments ADD COLUMN channel TEXT NOT NULL DEFAULT 'Bot' CHECK (channel IN ('Bot', 'Mini App'));
ALTER TABLE payments ADD COLUMN funnel_entry TEXT NOT NULL DEFAULT 'buy_command';

CREATE INDEX IF NOT EXISTS payments_channel_time_idx ON payments(channel, paid_at DESC);

PRAGMA optimize;
