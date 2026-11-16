-- Demo_Ecom foundation schema.
-- Money is always an integer number of paise; never a floating-point column.
-- Product content is durable; price and lifecycle are append-only ledgers.

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category_id uuid NOT NULL REFERENCES categories(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_category_idx ON products (category_id);

CREATE TABLE product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url text NOT NULL,
  alt text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_images_product_idx ON product_images (product_id, position);

CREATE TABLE product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  amount_paise bigint NOT NULL CHECK (amount_paise >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_prices_current_idx ON product_prices (product_id, created_at DESC, id DESC);

CREATE TABLE stock_levels (
  product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE product_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('active', 'archived')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_status_current_idx ON product_status_events (product_id, created_at DESC, id DESC);

CREATE TABLE carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  guest_token_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR guest_token_hash IS NOT NULL)
);
CREATE INDEX carts_user_idx ON carts (user_id);
CREATE UNIQUE INDEX carts_guest_token_unique ON carts (guest_token_hash)
  WHERE guest_token_hash IS NOT NULL;

CREATE TABLE cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, product_id)
);

CREATE TABLE checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_charge_paise bigint NOT NULL DEFAULT 0 CHECK (delivery_charge_paise >= 0),
  payable_total_paise bigint NOT NULL DEFAULT 0 CHECK (payable_total_paise >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX checkout_sessions_cart_idx ON checkout_sessions (cart_id);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id),
  subtotal_paise bigint NOT NULL CHECK (subtotal_paise >= 0),
  delivery_charge_paise bigint NOT NULL DEFAULT 0 CHECK (delivery_charge_paise >= 0),
  total_paise bigint NOT NULL CHECK (total_paise >= 0),
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_user_idx ON orders (user_id, created_at DESC);

CREATE TABLE order_addresses (
  order_id uuid PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  line1 text NOT NULL,
  line2 text NOT NULL DEFAULT '',
  city text NOT NULL,
  state text NOT NULL DEFAULT '',
  pincode text NOT NULL
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  unit_price_paise bigint NOT NULL CHECK (unit_price_paise >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  line_total_paise bigint NOT NULL CHECK (line_total_paise >= 0)
);
CREATE INDEX order_items_order_idx ON order_items (order_id);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  razorpay_order_id text,
  razorpay_payment_id text,
  amount_paise bigint NOT NULL CHECK (amount_paise >= 0),
  status text NOT NULL DEFAULT 'pending',
  signature_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_order_idx ON payments (order_id);

CREATE TABLE stock_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);
CREATE INDEX stock_holds_order_idx ON stock_holds (order_id);

CREATE TABLE order_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NOT NULL
    CHECK (status IN ('placed', 'packed', 'shipped', 'delivered', 'cancelled')),
  note text NOT NULL DEFAULT '',
  actor_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_status_events_order_idx ON order_status_events (order_id, created_at ASC);

-- Cards never reach this database. Razorpay identifiers and the verification
-- flag are the whole payment record.
COMMENT ON TABLE payments IS 'Razorpay identifiers only; no card numbers, CVV, expiry or full card payload is stored.';
