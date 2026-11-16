import { query } from '@/server/db';
import { getCart } from '@/features/cart/cartService';
import { validateDeliveryAddress } from './address';
import {
  assertCartPurchasable,
  readCheckoutCart,
} from './checkoutCart';
import { totalsForSubtotal } from './delivery';
import { CheckoutError } from './errors';
import {
  createRazorpayOrder,
  razorpayKeyId,
  razorpaySandboxEnabled,
} from './razorpay';
import type { CheckoutSessionView, DeliveryAddress } from './types';

const CHECKOUT_SESSION_MINUTES = 30;

export interface CreateCheckoutSessionResult {
  session: CheckoutSessionView;
  address: DeliveryAddress;
}

/**
 * Freeze a signed-in customer's cart into a checkout session and create the
 * Razorpay order for the server-calculated total. The browser sends only the
 * delivery address; every rupee is read again from the database.
 */
export async function createCheckoutSession(
  userId: string,
  rawAddress: unknown,
): Promise<CreateCheckoutSessionResult> {
  const { address, fieldErrors } = validateDeliveryAddress(rawAddress);
  if (!address) {
    throw new CheckoutError(
      422,
      'validation_failed',
      'Please correct the highlighted delivery details.',
      fieldErrors,
    );
  }

  const cart = await getCart({ userId });
  if (!cart.id || cart.lines.length === 0) {
    throw new CheckoutError(409, 'cart_empty', 'Your cart is empty. Add something before checking out.');
  }

  const snapshot = await readCheckoutCart(cart.id);
  if (snapshot.lines.length === 0) {
    throw new CheckoutError(409, 'cart_empty', 'Your cart is empty. Add something before checking out.');
  }
  assertCartPurchasable(snapshot);

  const totals = totalsForSubtotal(snapshot.subtotalPaise);
  const providerOrder = await createRazorpayOrder({
    amountPaise: totals.totalPaise,
    receipt: `demo_${Date.now().toString(36)}`,
  });

  if (providerOrder.amountPaise !== totals.totalPaise) {
    throw new CheckoutError(
      502,
      'razorpay_unexpected_response',
      'Razorpay returned a different amount. Your cart is unchanged; try again.',
    );
  }

  const expiresAt = new Date(Date.now() + CHECKOUT_SESSION_MINUTES * 60 * 1000);
  const inserted = await query<{ id: string }>(
    `INSERT INTO checkout_sessions
       (cart_id, user_id, address, delivery_charge_paise, payable_total_paise,
        razorpay_order_id, expires_at)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
     RETURNING id`,
    [
      cart.id,
      userId,
      JSON.stringify(address),
      totals.deliveryChargePaise,
      totals.totalPaise,
      providerOrder.id,
      expiresAt,
    ],
  );

  return {
    address,
    session: {
      id: inserted.rows[0].id,
      razorpayOrderId: providerOrder.id,
      keyId: razorpayKeyId(),
      currency: 'INR',
      sandbox: razorpaySandboxEnabled(),
      ...totals,
    },
  };
}
