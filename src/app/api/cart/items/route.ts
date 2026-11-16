import { NextResponse } from 'next/server';
import { cartOwnerForRequest } from '@/features/cart/requestOwner';
import { CartError, addCartItem, isUuid } from '@/features/cart/cartService';
import {
  parseCartQuantity,
  readCartPayload,
  serializeCartCookie,
} from '@/features/cart/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function refusal(error: unknown): NextResponse {
  if (error instanceof CartError) {
    return NextResponse.json(
      { error: error.code, message: error.message, fieldErrors: error.fieldErrors },
      { status: error.status },
    );
  }
  throw error;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await readCartPayload(request);
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Send the item as JSON or form data.' },
      { status: 400 },
    );
  }

  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const productId = typeof body.productId === 'string' ? body.productId : '';
  const quantity = parseCartQuantity(body.quantity, 1);

  try {
    if (!isUuid(productId)) {
      return NextResponse.json(
        {
          error: 'validation_failed',
          message: 'Choose a product to add.',
          fieldErrors: { productId: 'Choose a product to add.' },
        },
        { status: 422 },
      );
    }

    const { owner, guestToken, issueGuestCookie } = await cartOwnerForRequest(request);
    const result = await addCartItem(owner, { productId, quantity });
    const response = NextResponse.json({ cart: result.cart });
    if (issueGuestCookie && guestToken) {
      response.headers.append('Set-Cookie', serializeCartCookie(guestToken));
    }
    return response;
  } catch (error) {
    return refusal(error);
  }
}
