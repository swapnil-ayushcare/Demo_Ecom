-- Frozen checkout sessions and provider identifiers for Razorpay payments.
-- The session keeps the address, delivery charge and payable total between
-- address entry and a verified payment. No card data column is added anywhere.

ALTER TABLE checkout_sessions
  ADD COLUMN razorpay_order_id text,
  ADD COLUMN consumed_at timestamptz,
  ADD COLUMN order_id uuid REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX checkout_sessions_razorpay_idx ON checkout_sessions (razorpay_order_id);

-- A Razorpay payment may create at most one order, so a replayed callback
-- returns the existing order instead of charging the cart twice.
CREATE UNIQUE INDEX payments_razorpay_payment_unique
  ON payments (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

COMMENT ON COLUMN checkout_sessions.razorpay_order_id IS
  'The Razorpay order created for this frozen checkout; never a card payload.';
