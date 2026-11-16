import { getSessionUser, readSessionToken, type SessionUser } from '@/server/session';
import { CheckoutError } from './errors';

export async function readRequestPayload(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return await request.json();
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const form = await request.formData();
    const payload: Record<string, unknown> = {};
    form.forEach((value, key) => {
      if (typeof value === 'string') {
        payload[key] = value;
      }
    });
    return payload;
  }

  return {};
}

export async function requireCheckoutUser(request: Request): Promise<SessionUser> {
  const token = readSessionToken(request.headers.get('cookie'));
  const user = token ? await getSessionUser(token) : null;
  if (!user) {
    throw new CheckoutError(401, 'sign_in_required', 'Sign in to check out.');
  }
  return user;
}
