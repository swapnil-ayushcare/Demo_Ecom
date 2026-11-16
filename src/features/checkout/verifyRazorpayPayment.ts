import { query } from '@/server/db';
import { isUuid } from './address';
import { createOrderFromPayment } from './createOrderFromPayment';
import { CheckoutError } from './errors';
import { verifyRazorpaySignature } from './razorpay';
import type { PlacedOrder } from './types';

export interface VerifyRazorpayInput {
  checkoutSessionId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

interface CheckoutSessionRow {
  id: string;
  user_id: string;
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

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseVerifyInput(raw: unknown): VerifyRazorpayInput {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const checkoutSessionId = readString(
    body.checkoutSessionId ?? body.checkout_session_id,
  );
  const razorpayOrderId = readString(body.razorpayOrderId ?? body.razorpay_order_id);
  const razorpayPaymentId = readString(
    body.razorpayPaymentId ?? body.razorpay_payment_id,
  );
  const razorpaySignature = readString(
    body.razorpaySignature ?? body.razorpay_signature,
  );

  const fieldErrors: Record<string, string> = {};
  if (!isUuid(checkoutSessionId)) {
    fieldErrors.checkoutSessionId = 'Start the checkout again from your cart.';
  }
  if (!razorpayOrderId.startsWith('order_')) {
    fieldErrors.razorpayOrderId = 'The Razorpay order is missing.';
  }
  if (!razorpayPaymentId.startsWith('pay_')) {
    fieldErrors.razorpayPaymentId = 'The Razorpay payment is missing.';
  }
  if (!/^[a-f0-9]{64}$/i.test(razorpaySignature)) {
    fieldErrors.razorpaySignature = 'The payment signature is missing.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new CheckoutError(
      422,
      'validation_failed',
      'The payment result is incomplete. Your cart is unchanged; try again.',
      fieldErrors,
    );
  }

  return { checkoutSessionId, razorpayOrderId, razorpayPaymentId, razorpaySignature };
}

/**
 * Verify the Razorpay HMAC with the server-only key secret, then create the
 * order. A bad signature stops before any write, so a failed or tampered
 * payment cannot create an order or clear the cart.
 */
export async function verifyRazorpayPayment(
  userId: string,
  input: VerifyRazorpayInput,
): Promise<PlacedOrder> {
  const result = await query<CheckoutSessionRow>(
    `SELECT id, user_id, razorpay_order_id, consumed_at, order_id, expires_at
       FROM checkout_sessions
      WHERE id = $1 AND user_id = $2
      LIMIT 1`,
    [input.checkoutSessionId, userId],
  );
  const session = result.rows[0];
  if (!session) {
    throw new CheckoutError(
      404,
      'checkout_session_not_found',
      'That checkout is no longer here. Return to your cart and start again.',
    );
  }

  if (session.consumed_at && session.order_id) {
    const existing = await query<OrderRow>(
      `SELECT id, order_number, total_paise, payment_status
         FROM orders
        WHERE id = $1 AND user_id = $2`,
      [session.order_id, userId],
    );
    if (existing.rows[0]) {
      const order = existing.rows[0];
      return {
        id: order.id,
        orderNumber: order.order_number,
        totalPaise: order.total_paise,
        paymentStatus: order.payment_status,
      };
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
      'This payment does not belong to this checkout. Your cart is unchanged.',
    );
  }

  const signatureVerified = verifyRazorpaySignature(
    input.razorpayOrderId,
    input.razorpayPaymentId,
    input.razorpaySignature,
  );
  if (!signatureVerified) {
    throw new CheckoutError(
      402,
      'payment_verification_failed',
      'We could not verify this payment, so no order was created. Your cart is unchanged.',
    );
  }

  return createOrderFromPayment({
    userId,
    checkoutSessionId: input.checkoutSessionId,
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
  });
}
