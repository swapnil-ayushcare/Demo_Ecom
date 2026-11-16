import { NextResponse } from 'next/server';
import { query } from '@/server/db';
import { isUuid } from '@/features/checkout/address';
import { CheckoutError } from '@/features/checkout/errors';
import { readRequestPayload, requireCheckoutUser } from '@/features/checkout/http';
import { razorpaySandboxEnabled } from '@/features/checkout/razorpay';
import { createSandboxPayment } from '@/features/checkout/sandboxProvider';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface CheckoutSessionRow {
  razorpay_order_id: string | null;
  consumed_at: Date | null;
  expires_at: Date | null;
}

function refusal(error: unknown): NextResponse {
  if (error instanceof CheckoutError) {
    return NextResponse.json(
      { error: error.code, message: error.message, fieldErrors: error.fieldErrors },
      { status: error.status },
    );
  }
  console.error(
    'Sandbox payment fixture failed:',
    error instanceof Error ? error.message : 'unknown error',
  );
  return NextResponse.json(
    { error: 'sandbox_unavailable', message: 'The payment sandbox is unavailable.' },
    { status: 500 },
  );
}

/**
 * The local Razorpay sandbox fixture. It signs a payment exactly as the test
 * provider would; the browser still has to present that signature to
 * /api/checkout/verify, which uses the shop's real verifier. Disabled unless
 * RAZORPAY_SANDBOX=1.
 */
export async function POST(request: Request) {
  if (!razorpaySandboxEnabled()) {
    return NextResponse.json(
      { error: 'not_found', message: 'The payment sandbox is not enabled.' },
      { status: 404 },
    );
  }

  let payload: unknown;
  try {
    payload = await readRequestPayload(request);
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Send the payment choice as JSON.' },
      { status: 400 },
    );
  }

  try {
    const user = await requireCheckoutUser(request);
    const body =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const checkoutSessionId =
      typeof body.checkoutSessionId === 'string' ? body.checkoutSessionId : '';
    const method = body.method;

    if (!isUuid(checkoutSessionId)) {
      throw new CheckoutError(422, 'validation_failed', 'Start the checkout again.', {
        checkoutSessionId: 'Start the checkout again from your cart.',
      });
    }
    if (method !== 'upi' && method !== 'card' && method !== 'cancel') {
      throw new CheckoutError(422, 'validation_failed', 'Choose a payment method.', {
        method: 'Choose a payment method.',
      });
    }

    const result = await query<CheckoutSessionRow>(
      `SELECT razorpay_order_id, consumed_at, expires_at
         FROM checkout_sessions
        WHERE id = $1 AND user_id = $2
        LIMIT 1`,
      [checkoutSessionId, user.id],
    );
    const session = result.rows[0];
    if (!session || !session.razorpay_order_id) {
      throw new CheckoutError(
        404,
        'checkout_session_not_found',
        'That checkout is no longer here. Return to your cart and start again.',
      );
    }
    if (session.consumed_at) {
      throw new CheckoutError(409, 'checkout_consumed', 'This checkout is already paid.');
    }
    if (session.expires_at && session.expires_at.getTime() < Date.now()) {
      throw new CheckoutError(
        409,
        'checkout_expired',
        'This checkout has expired. Your cart is unchanged; start again.',
      );
    }

    const payment = createSandboxPayment(session.razorpay_order_id, method);
    return NextResponse.json(payment);
  } catch (error) {
    return refusal(error);
  }
}
