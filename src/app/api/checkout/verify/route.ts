import { NextResponse } from 'next/server';
import { CheckoutError } from '@/features/checkout/errors';
import { readRequestPayload, requireCheckoutUser } from '@/features/checkout/http';
import {
  parseVerifyInput,
  verifyRazorpayPayment,
} from '@/features/checkout/verifyRazorpayPayment';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function refusal(error: unknown): NextResponse {
  if (error instanceof CheckoutError) {
    return NextResponse.json(
      { error: error.code, message: error.message, fieldErrors: error.fieldErrors },
      { status: error.status },
    );
  }
  console.error(
    'Payment verification failed:',
    error instanceof Error ? error.message : 'unknown error',
  );
  return NextResponse.json(
    {
      error: 'payment_verification_failed',
      message: 'We could not confirm this payment, so no order was created. Your cart is unchanged.',
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await readRequestPayload(request);
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Send the payment result as JSON.' },
      { status: 400 },
    );
  }

  try {
    const user = await requireCheckoutUser(request);
    const input = parseVerifyInput(payload);
    const order = await verifyRazorpayPayment(user.id, input);
    return NextResponse.json({ order });
  } catch (error) {
    return refusal(error);
  }
}
