import { NextResponse } from 'next/server';
import { createCheckoutSession } from '@/features/checkout/createCheckoutSession';
import { CheckoutError } from '@/features/checkout/errors';
import { readRequestPayload, requireCheckoutUser } from '@/features/checkout/http';

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
    'Checkout session failed:',
    error instanceof Error ? error.message : 'unknown error',
  );
  return NextResponse.json(
    {
      error: 'checkout_failed',
      message: 'We could not start the checkout. Your cart is unchanged; try again.',
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
      { error: 'invalid_request', message: 'Send the delivery address as JSON or form data.' },
      { status: 400 },
    );
  }

  try {
    const user = await requireCheckoutUser(request);
    const body =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const address = body.address ?? body;
    const result = await createCheckoutSession(user.id, address);
    return NextResponse.json(
      { checkoutSession: result.session, address: result.address },
      { status: 201 },
    );
  } catch (error) {
    return refusal(error);
  }
}
