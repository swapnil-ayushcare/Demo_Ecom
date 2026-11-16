import { lineTotalPaise, sumPaise } from '@/lib/money';
import { query } from '@/server/db';
import { CheckoutError } from './errors';
import type { CheckoutLine } from './types';

interface CheckoutCartRow {
  id: string;
  product_id: string;
  quantity: number;
  name: string;
  unit_price_paise: number;
  stock_quantity: number;
  held_quantity: number;
  status: string | null;
  product_exists: boolean;
}

export interface CheckoutCartSnapshot {
  lines: CheckoutLine[];
  subtotalPaise: number;
}

export const CHECKOUT_CART_SELECT = `
  SELECT ci.id, ci.product_id, ci.quantity, p.name,
         COALESCE(pr.amount_paise, 0) AS unit_price_paise,
         COALESCE(sl.quantity, 0) AS stock_quantity,
         COALESCE(held.held_quantity, 0) AS held_quantity,
         st.status,
         (p.id IS NOT NULL) AS product_exists
    FROM cart_items ci
    LEFT JOIN products p ON p.id = ci.product_id
    LEFT JOIN LATERAL (
      SELECT amount_paise
        FROM product_prices
       WHERE product_id = p.id
       ORDER BY created_at DESC, id DESC
       LIMIT 1
    ) pr ON true
    LEFT JOIN stock_levels sl ON sl.product_id = p.id
    LEFT JOIN LATERAL (
      SELECT SUM(quantity)::int AS held_quantity
        FROM stock_holds
       WHERE product_id = p.id AND released_at IS NULL
    ) held ON true
    LEFT JOIN LATERAL (
      SELECT status
        FROM product_status_events
       WHERE product_id = p.id
       ORDER BY created_at DESC, id DESC
       LIMIT 1
    ) st ON true
   WHERE ci.cart_id = $1
   ORDER BY ci.created_at ASC, ci.id ASC
`;

export function mapCheckoutRows(rows: CheckoutCartRow[]): CheckoutCartSnapshot {
  const lines: CheckoutLine[] = rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    name: row.name,
    quantity: row.quantity,
    unitPricePaise: row.unit_price_paise,
    lineTotalPaise: lineTotalPaise(row.unit_price_paise, row.quantity),
    availableQuantity: Math.max(0, row.stock_quantity - row.held_quantity),
    archived: row.status === 'archived',
  }));

  return {
    lines,
    subtotalPaise: sumPaise(lines.map((line) => line.lineTotalPaise)),
  };
}

export async function readCheckoutCart(cartId: string): Promise<CheckoutCartSnapshot> {
  const result = await query<CheckoutCartRow>(CHECKOUT_CART_SELECT, [cartId]);
  return mapCheckoutRows(result.rows);
}

/**
 * Refuse a cart whose product was archived, whose price disappeared, or whose
 * quantity is no longer on the shelf. This is the server's check, never the
 * browser's.
 */
export function assertCartPurchasable(snapshot: CheckoutCartSnapshot): void {
  for (const line of snapshot.lines) {
    if (line.archived) {
      const message = `${line.name} is no longer sold. Your cart has not changed; remove it and try again.`;
      throw new CheckoutError(409, 'product_archived', message, { cart: message });
    }
    if (line.availableQuantity < line.quantity) {
      const message =
        line.availableQuantity < 1
          ? `${line.name} is out of stock. Your cart has not changed; adjust it and try again.`
          : `Only ${line.availableQuantity} of ${line.name} left on the shelf. Your cart has not changed; adjust it and try again.`;
      throw new CheckoutError(409, 'stock_changed', message, {
        cart: message,
      });
    }
  }
}
