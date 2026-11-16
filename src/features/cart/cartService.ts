import { lineTotalPaise, sumPaise } from '@/lib/money';
import { query } from '@/server/db';
import { hashToken, newOpaqueToken } from '@/server/passwords';
import {
  MAX_CART_LINE_QUANTITY,
  emptyCart,
  type Cart,
  type CartLine,
} from './types';

export const CART_COOKIE_NAME = 'demo_ecom_cart';
export { MAX_CART_LINE_QUANTITY, emptyCart } from './types';
export type { Cart, CartLine } from './types';

const CART_SELECT = `
  SELECT ci.id, ci.product_id, ci.quantity, p.slug, p.name,
         COALESCE(pr.amount_paise, 0) AS unit_price_paise,
         COALESCE(sl.quantity, 0) AS stock_quantity,
         img.url AS image_url
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    LEFT JOIN LATERAL (
      SELECT amount_paise
        FROM product_prices
       WHERE product_id = p.id
       ORDER BY created_at DESC, id DESC
       LIMIT 1
    ) pr ON true
    LEFT JOIN stock_levels sl ON sl.product_id = p.id
    LEFT JOIN LATERAL (
      SELECT url
        FROM product_images
       WHERE product_id = p.id
       ORDER BY position ASC, id ASC
       LIMIT 1
    ) img ON true
   WHERE ci.cart_id = $1
   ORDER BY ci.created_at ASC, ci.id ASC
`;

export interface CartOwner {
  userId?: string | null;
  guestToken?: string | null;
}

interface CartLineRow {
  id: string;
  product_id: string;
  quantity: number;
  slug: string;
  name: string;
  unit_price_paise: number;
  stock_quantity: number;
  image_url: string | null;
}

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  status: string | null;
  stock_quantity: number;
}

export class CartError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, code: string, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'CartError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function readCartToken(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === CART_COOKIE_NAME) {
      const value = rest.join('=');
      return value.length > 0 ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

export function serializeCartCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false';
  const parts = [
    `${CART_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

/** A fresh opaque guest token; only its hash is written to the cart row. */
export function newGuestCartToken(): string {
  return newOpaqueToken();
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

function mapLine(row: CartLineRow): CartLine {
  return {
    id: row.id,
    productId: row.product_id,
    slug: row.slug,
    name: row.name,
    imageUrl: row.image_url,
    unitPricePaise: row.unit_price_paise,
    quantity: row.quantity,
    lineTotalPaise: lineTotalPaise(row.unit_price_paise, row.quantity),
    stockQuantity: row.stock_quantity,
  };
}

function cartFromLines(id: string | null, rows: CartLineRow[]): Cart {
  const lines = rows.map(mapLine);
  return {
    id,
    currency: 'INR',
    lines,
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
    lineCount: lines.length,
    subtotalPaise: sumPaise(lines.map((line) => line.lineTotalPaise)),
  };
}

async function findCartId(owner: CartOwner): Promise<string | null> {
  if (owner.userId) {
    const result = await query<{ id: string }>(
      `SELECT id FROM carts WHERE user_id = $1 ORDER BY created_at ASC, id ASC LIMIT 1`,
      [owner.userId],
    );
    return result.rows[0]?.id ?? null;
  }

  if (owner.guestToken) {
    const result = await query<{ id: string }>(
      `SELECT id FROM carts WHERE guest_token_hash = $1 LIMIT 1`,
      [hashToken(owner.guestToken)],
    );
    return result.rows[0]?.id ?? null;
  }

  return null;
}

async function getOrCreateCartId(owner: CartOwner): Promise<string> {
  const existing = await findCartId(owner);
  if (existing) {
    return existing;
  }

  if (owner.userId) {
    const inserted = await query<{ id: string }>(
      `INSERT INTO carts (user_id) VALUES ($1) RETURNING id`,
      [owner.userId],
    );
    return inserted.rows[0].id;
  }

  if (owner.guestToken) {
    const inserted = await query<{ id: string }>(
      `INSERT INTO carts (guest_token_hash) VALUES ($1)
       ON CONFLICT (guest_token_hash) WHERE guest_token_hash IS NOT NULL
       DO UPDATE SET updated_at = now()
       RETURNING id`,
      [hashToken(owner.guestToken)],
    );
    return inserted.rows[0].id;
  }

  throw new CartError(401, 'cart_owner_required', 'Sign in or enable cookies to keep a cart.');
}

export async function getCart(owner: CartOwner): Promise<Cart> {
  const cartId = await findCartId(owner);
  if (!cartId) {
    return emptyCart();
  }
  const rows = await query<CartLineRow>(CART_SELECT, [cartId]);
  return cartFromLines(cartId, rows.rows);
}

async function readProductForCart(productId: string): Promise<ProductRow> {
  const result = await query<ProductRow>(
    `SELECT p.id, p.slug, p.name,
            st.status,
            COALESCE(sl.quantity, 0) AS stock_quantity
       FROM products p
       LEFT JOIN stock_levels sl ON sl.product_id = p.id
       LEFT JOIN LATERAL (
         SELECT status
           FROM product_status_events
          WHERE product_id = p.id
          ORDER BY created_at DESC, id DESC
          LIMIT 1
       ) st ON true
      WHERE p.id = $1
      LIMIT 1`,
    [productId],
  );
  const product = result.rows[0];
  if (!product) {
    throw new CartError(404, 'product_not_found', 'That product is not in the shop.', {
      productId: 'That product is not in the shop.',
    });
  }
  if (product.status === 'archived') {
    throw new CartError(409, 'product_archived', 'That product is no longer available.', {
      productId: 'That product is no longer available.',
    });
  }
  return product;
}

export interface AddCartItemInput {
  productId: string;
  quantity: number;
}

export interface AddCartItemResult {
  cart: Cart;
  guestToken?: string;
}

export async function addCartItem(
  owner: CartOwner,
  input: AddCartItemInput,
): Promise<AddCartItemResult> {
  if (!isUuid(input.productId)) {
    throw new CartError(422, 'validation_failed', 'Choose a product to add.', {
      productId: 'Choose a product to add.',
    });
  }

  const quantity = input.quantity;
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_CART_LINE_QUANTITY
  ) {
    throw new CartError(
      422,
      'validation_failed',
      'Choose a quantity between 1 and 99.',
      { quantity: 'Choose a quantity between 1 and 99.' },
    );
  }

  const product = await readProductForCart(input.productId);
  if (product.stock_quantity < 1) {
    throw new CartError(422, 'out_of_stock', 'That product is out of stock.', {
      quantity: 'That product is out of stock.',
    });
  }

  const cartId = await getOrCreateCartId(owner);
  await query(
    `INSERT INTO cart_items (cart_id, product_id, quantity)
     VALUES ($1, $2, LEAST($3::int, $4::int))
     ON CONFLICT (cart_id, product_id) DO UPDATE
       SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, $4::int)`,
    [cartId, product.id, quantity, Math.min(product.stock_quantity, MAX_CART_LINE_QUANTITY)],
  );
  await query(`UPDATE carts SET updated_at = now() WHERE id = $1`, [cartId]);

  return { cart: await getCart(owner) };
}

export async function updateCartItem(
  owner: CartOwner,
  itemId: string,
  quantity: number,
): Promise<Cart> {
  if (!isUuid(itemId)) {
    throw new CartError(404, 'cart_line_not_found', 'That cart line is no longer here.', {
      itemId: 'That cart line is no longer here.',
    });
  }
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_CART_LINE_QUANTITY
  ) {
    throw new CartError(
      422,
      'validation_failed',
      'Choose a quantity between 1 and 99.',
      { quantity: 'Choose a quantity between 1 and 99.' },
    );
  }

  const cartId = await findCartId(owner);
  if (!cartId) {
    throw new CartError(404, 'cart_line_not_found', 'That cart line is no longer here.', {
      itemId: 'That cart line is no longer here.',
    });
  }

  const item = await query<{ product_id: string }>(
    `SELECT product_id FROM cart_items WHERE id = $1 AND cart_id = $2`,
    [itemId, cartId],
  );
  const productId = item.rows[0]?.product_id;
  if (!productId) {
    throw new CartError(404, 'cart_line_not_found', 'That cart line is no longer here.', {
      itemId: 'That cart line is no longer here.',
    });
  }

  const product = await readProductForCart(productId);
  if (product.stock_quantity < 1) {
    throw new CartError(422, 'out_of_stock', 'That product is out of stock.', {
      quantity: 'That product is out of stock.',
    });
  }
  if (quantity > product.stock_quantity) {
    throw new CartError(
      422,
      'quantity_too_high',
      `Only ${product.stock_quantity} left on the shelf.`,
      { quantity: `Only ${product.stock_quantity} left on the shelf.` },
    );
  }

  await query(`UPDATE cart_items SET quantity = $1 WHERE id = $2 AND cart_id = $3`, [
    quantity,
    itemId,
    cartId,
  ]);
  await query(`UPDATE carts SET updated_at = now() WHERE id = $1`, [cartId]);
  return getCart(owner);
}

export async function removeCartItem(owner: CartOwner, itemId: string): Promise<Cart> {
  if (!isUuid(itemId)) {
    throw new CartError(404, 'cart_line_not_found', 'That cart line is no longer here.', {
      itemId: 'That cart line is no longer here.',
    });
  }

  const cartId = await findCartId(owner);
  if (!cartId) {
    throw new CartError(404, 'cart_line_not_found', 'That cart line is no longer here.', {
      itemId: 'That cart line is no longer here.',
    });
  }

  const removed = await query(
    `DELETE FROM cart_items WHERE id = $1 AND cart_id = $2`,
    [itemId, cartId],
  );
  if (removed.rowCount === 0) {
    throw new CartError(404, 'cart_line_not_found', 'That cart line is no longer here.', {
      itemId: 'That cart line is no longer here.',
    });
  }
  await query(`UPDATE carts SET updated_at = now() WHERE id = $1`, [cartId]);
  return getCart(owner);
}

export const cartService = {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
};
