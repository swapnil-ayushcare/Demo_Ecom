import { getSessionUser, readSessionToken } from '@/server/session';
import {
  newGuestCartToken,
  readCartToken,
  type CartOwner,
} from './cartService';

export interface RequestCartOwner {
  owner: CartOwner;
  guestToken: string | null;
  issueGuestCookie: boolean;
}

/**
 * Resolve who owns this request's cart. A signed-in customer is identified by
 * their session; everyone else gets an opaque guest token in an HTTP-only
 * cookie so two browsers never share a cart.
 */
export async function cartOwnerForRequest(request: Request): Promise<RequestCartOwner> {
  const cookieHeader = request.headers.get('cookie');
  const sessionToken = readSessionToken(cookieHeader);
  const user = sessionToken ? await getSessionUser(sessionToken) : null;

  if (user) {
    return { owner: { userId: user.id }, guestToken: null, issueGuestCookie: false };
  }

  const existing = readCartToken(cookieHeader);
  const guestToken = existing ?? newGuestCartToken();

  return {
    owner: { guestToken },
    guestToken,
    issueGuestCookie: existing === null,
  };
}
