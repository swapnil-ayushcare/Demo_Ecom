import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { formatINR } from '@/lib/money';
import { withTransaction } from '@/server/db';
import {
  CHECKOUT_CART_SELECT,
  assertCartPurchasable,
  mapCheckoutRows,
  type CheckoutCartSnapshot,
} from './checkoutCart';
import { CheckoutError } from './errors';
import type { DeliveryAddress, PlacedOrder } from './types';

interface CheckoutSessionRow {
  id: string;
  cart_id: string;
  user_id: string;
  address: DeliveryAddress;
  delivery_charge_paise: number;
  payable_total_paise: number;
  razorpay_order_id: string | null;
  consumed_at: Date | null;
  order_id: string | null;
  expires_at: Date | null;
}

interface OrderRow {
  id: string;
  order_number: string;
  total_paise: number;
  payment_status: string;
}

export interface CreateOrderFromPaymentInput {
  userId: string;
  checkoutSessionId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
}

function mapOrder(row: OrderRow): PlacedOrder {
  return {
    id: row.id,
    orderNumber: row.order_number,
    totalPaise: row.total_paise,
    paymentStatus: row.payment_status,
  };
}

function newOrderNumber(): string {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `DE-${day}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

async function loadExistingOrder(
  client: PoolClient,
  orderId: string,
  userId: string,
): Promise<PlacedOrder | null> {
  const result = await client.query<OrderRow>(
    `SELECT id, order_number, total_paise, payment_status
       FROM orders
      WHERE id = $1 AND user_id = $2`,
    [orderId, userId],
  );
  return result.rows[0] ? mapOrder(result.rows[0]) : null;
}

async function readSnapshot(client: PoolClient, cartId: string): Promise<CheckoutCartSnapshot> {
  const result = await client.query(CHECKOUT_CART_SELECT, [cartId]);
  return mapCheckoutRows(result.rows);
}

async function lockStockRows(client: PoolClient, productIds: string[]): Promise<void> {
  await client.query(
    `SELECT product_id
       FROM stock_levels
      WHERE product_id = ANY($1::uuid[])
      ORDER BY product_id
      FOR UPDATE`,
    [productIds],
  );
}

/**
 * Turn a verified Razorpay payment into exactly one order. The cart, price
 * ledger and available stock are all re-read inside the transaction; a price
 * or stock change since the address step refuses the order instead of quietly
 * charging a different amount.
 */
export async function createOrderFromPayment(
  input: CreateOrderFromPaymentInput,
): Promise<PlacedOrder> {
  return withTransaction(async (client) => {
    const sessionResult = await client.query<CheckoutSessionRow>(
      `SELECT id, cart_id, user_id, address, delivery_charge_paise,
              payable_total_paise, razorpay_order_id, consumed_at, order_id,
              expires_at
         FROM checkout_sessions
        WHERE id = $1 AND user_id = $2
        FOR UPDATE`,
      [input.checkoutSessionId, input.userId],
    );
    const session = sessionResult.rows[0];
    if (!session) {
      throw new CheckoutError(
        404,
        'checkout_session_not_found',
        'That checkout is no longer here. Return to your cart and start again.',
      );
    }

    if (session.consumed_at && session.order_id) {
      const existing = await loadExistingOrder(client, session.order_id, input.userId);
      if (existing) {
        return existing;
      }
    }

    if (session.expires_at && session.expires_at.getTime() < Date.now()) {
      throw new CheckoutError(
        409,
        'checkout_expired',
        'This checkout has expired. Your cart is unchanged; start again.',
      );
    }

    if (session.razorpay_order_id !== input.razorpayOrderId) {
      throw new CheckoutError(
        400,
        'payment_mismatch',
        'This payment does not belong to this checkout.',
      );
    }

    const duplicatePayment = await client.query<OrderRow>(
      `SELECT o.id, o.order_number, o.total_paise, o.payment_status
         FROM payments p
         JOIN orders o ON o.id = p.order_id
        WHERE p.razorpay_payment_id = $1
        LIMIT 1`,
      [input.razorpayPaymentId],
    );
    if (duplicatePayment.rows[0]) {
      return mapOrder(duplicatePayment.rows[0]);
    }

    const firstRead = await readSnapshot(client, session.cart_id);
    if (firstRead.lines.length === 0) {
      throw new CheckoutError(
        409,
        'cart_empty',
        'Your cart is empty, so there is nothing to order. Return to the shop.',
      );
    }

    const productIds = firstRead.lines.map((line) => line.productId);
    await lockStockRows(client, productIds);

    // Re-read after the stock rows are locked so another checkout that held
    // stock before us is visible and counted.
    const snapshot = await readSnapshot(client, session.cart_id);
    if (snapshot.lines.length === 0) {
      throw new CheckoutError(
        409,
        'cart_empty',
        'Your cart is empty, so there is nothing to order. Return to the shop.',
      );
    }
    assertCartPurchasable(snapshot);

    const frozenSubtotal = session.payable_total_paise - session.delivery_charge_paise;
    if (snapshot.subtotalPaise !== frozenSubtotal) {
      throw new CheckoutError(
        409,
        'price_changed',
        `The price of something in your cart changed to ${formatINR(
          snapshot.subtotalPaise,
        )} before payment was confirmed. Your cart is unchanged; review it and pay again.`,
      );
    }

    const subtotalPaise = snapshot.subtotalPaise;
    const totalPaise = subtotalPaise + session.delivery_charge_paise;

    const orderResult = await client.query<{ id: string; order_number: string }>(
      `INSERT INTO orders
         (order_number, user_id, subtotal_paise, delivery_charge_paise, total_paise,
          payment_status)
       VALUES ($1, $2, $3, $4, $5, 'paid')
       RETURNING id, order_number`,
      [
        newOrderNumber(),
        input.userId,
        subtotalPaise,
        session.delivery_charge_paise,
        totalPaise,
      ],
    );
    const order = orderResult.rows[0];

    const address = session.address;
    await client.query(
      `INSERT INTO order_addresses
         (order_id, name, phone, line1, line2, city, state, pincode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        order.id,
        address.name,
        address.phone,
        address.line1,
        address.line2 ?? '',
        address.city,
        address.state,
        address.pincode,
      ],
    );

    for (const line of snapshot.lines) {
      await client.query(
        `INSERT INTO order_items
           (order_id, product_id, product_name, unit_price_paise, quantity,
            line_total_paise)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          order.id,
          line.productId,
          line.name,
          line.unitPricePaise,
          line.quantity,
          line.lineTotalPaise,
        ],
      );

      await client.query(
        `INSERT INTO stock_holds (order_id, product_id, quantity)
         VALUES ($1, $2, $3)`,
        [order.id, line.productId, line.quantity],
      );
    }

    await client.query(
      `INSERT INTO payments
         (order_id, razorpay_order_id, razorpay_payment_id, amount_paise,
          status, signature_verified)
       VALUES ($1, $2, $3, $4, 'captured', true)`,
      [order.id, input.razorpayOrderId, input.razorpayPaymentId, totalPaise],
    );

    await client.query(
      `INSERT INTO order_status_events (order_id, status, actor_user_id)
       VALUES ($1, 'placed', $2)`,
      [order.id, input.userId],
    );

    await client.query(
      `UPDATE checkout_sessions
          SET consumed_at = now(), order_id = $2
        WHERE id = $1`,
      [session.id, order.id],
    );

    await client.query('DELETE FROM cart_items WHERE cart_id = $1', [session.cart_id]);

    return {
      id: order.id,
      orderNumber: order.order_number,
      totalPaise,
      paymentStatus: 'paid',
    };
  });
}
