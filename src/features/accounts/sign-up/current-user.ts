import { cookies } from 'next/headers';
import { getSessionUser, SESSION_COOKIE_NAME, type SessionUser } from '@/server/session';

/**
 * Read the signed-in customer from the HTTP-only session cookie. Only the
 * server ever sees the token; components receive the safe user fields.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  return getSessionUser(token);
}
