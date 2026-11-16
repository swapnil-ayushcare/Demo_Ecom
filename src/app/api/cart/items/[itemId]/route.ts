import { NextResponse } from 'next/server';
import { cartOwnerForRequest } from '@/features/cart/requestOwner';
import { CartError, removeCartItem, updateCartItem } from '@/features/cart/cartService';
import { parseCartQuantity, readCartPayload } from '@/features/cart/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: { itemId: string };
}

function refusal(error: unknown): NextResponse {
  if (error instanceof CartError) {
    return NextResponse.json(
      { error: error.code, message: error.message, fieldErrors: error.fieldErrors },
      { status: error.status },
    );
  }
  throw error;
}

export async function PATCH(request: Request, context: RouteContext) {
  let payload: unknown;
  try {
    payload = await readCartPayload(request);
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Send the quantity as JSON or form data.' },
      { status: 400 },
    );
  }

  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const quantity = parseCartQuantity(body.quantity);

  try {
    const { owner } = await cartOwnerForRequest(request);
    const cart = await updateCartItem(owner, context.params.itemId, quantity);
    return NextResponse.json({ cart });
  } catch (error) {
    return refusal(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { owner } = await cartOwnerForRequest(request);
    const cart = await removeCartItem(owner, context.params.itemId);
    return NextResponse.json({ cart });
  } catch (error) {
    return refusal(error);
  }
}
