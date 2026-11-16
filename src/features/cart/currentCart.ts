import { cookies } from 'next/headers';
import { getSessionUser, SESSION_COOKIE_NAME } from '@/server/session';
import { CART_COOKIE_NAME, getCart, type Cart } from './cartService';

export interface CurrentCart {
  cart: Cart;
  signedIn: boolean;
  userName?: string;
}

/**
 * Read the cart for the current request from the HTTP-only cookies. Only the
 * server sees the session or guest token; the cart page and header receive
 * safe totals and line data.
 */
export async function getCurrentCart(): Promise<CurrentCart> {
  const cookieStore = cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const user = sessionToken ? await getSessionUser(sessionToken) : null;
  const owner = user
    ? { userId: user.id }
    : { guestToken: cookieStore.get(CART_COOKIE_NAME)?.value ?? null };

  return {
    cart: await getCart(owner),
    signedIn: Boolean(user),
    userName: user?.name,
  };
}
