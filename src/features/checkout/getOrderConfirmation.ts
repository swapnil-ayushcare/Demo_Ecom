import { query } from '@/server/db';
import type { DeliveryAddress, OrderConfirmation } from './types';

interface ConfirmationRow {
  id: string;
  order_number: string;
  subtotal_paise: number;
  delivery_charge_paise: number;
  total_paise: number;
  payment_status: string;
  created_at: Date;
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
}

interface ConfirmationItemRow {
  product_name: string;
  unit_price_paise: number;
  quantity: number;
  line_total_paise: number;
}

/**
 * Read one order confirmation for its owning customer. The order number is
 * scoped by the session user, so another customer's order resolves to null.
 */
export async function getOrderConfirmation(
  userId: string,
  orderNumber: string,
): Promise<OrderConfirmation | null> {
  const orderResult = await query<ConfirmationRow>(
    `SELECT o.id, o.order_number, o.subtotal_paise, o.delivery_charge_paise,
            o.total_paise, o.payment_status, o.created_at,
            a.name, a.phone, a.line1, a.line2, a.city, a.state, a.pincode
       FROM orders o
       JOIN order_addresses a ON a.order_id = o.id
      WHERE o.user_id = $1 AND o.order_number = $2
      LIMIT 1`,
    [userId, orderNumber],
  );
  const row = orderResult.rows[0];
  if (!row) {
    return null;
  }

  const itemsResult = await query<ConfirmationItemRow>(
    `SELECT product_name, unit_price_paise, quantity, line_total_paise
       FROM order_items
      WHERE order_id = $1
      ORDER BY product_name ASC, id ASC`,
    [row.id],
  );

  const address: DeliveryAddress = {
    name: row.name,
    phone: row.phone,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
  };

  return {
    id: row.id,
    orderNumber: row.order_number,
    subtotalPaise: row.subtotal_paise,
    deliveryChargePaise: row.delivery_charge_paise,
    totalPaise: row.total_paise,
    paymentStatus: row.payment_status,
    createdAt: row.created_at,
    address,
    items: itemsResult.rows.map((item) => ({
      productName: item.product_name,
      unitPricePaise: item.unit_price_paise,
      quantity: item.quantity,
      lineTotalPaise: item.line_total_paise,
    })),
  };
}
