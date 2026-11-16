import { NextResponse } from 'next/server';
import { getCart } from '@/features/cart/cartService';
import { cartOwnerForRequest } from '@/features/cart/requestOwner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { owner } = await cartOwnerForRequest(request);
  const cart = await getCart(owner);
  return NextResponse.json({ cart });
}
