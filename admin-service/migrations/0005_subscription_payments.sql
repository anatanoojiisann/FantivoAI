ALTER TABLE payments ADD COLUMN product_type TEXT NOT NULL DEFAULT 'credit_pack' CHECK (product_type IN ('credit_pack', 'subscription'));
ALTER TABLE payments ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'one_time' CHECK (billing_cycle IN ('one_time', 'subscription'));
ALTER TABLE payments ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0 CHECK (is_recurring IN (0, 1));
ALTER TABLE payments ADD COLUMN is_first_recurring INTEGER NOT NULL DEFAULT 0 CHECK (is_first_recurring IN (0, 1));
ALTER TABLE payments ADD COLUMN subscription_expiration_date INTEGER;

CREATE INDEX IF NOT EXISTS payments_product_type_time_idx ON payments(product_type, paid_at DESC);

PRAGMA optimize;
