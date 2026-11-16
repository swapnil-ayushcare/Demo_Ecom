import { NextResponse } from 'next/server';
import {
  clearSessionCookie,
  readSessionToken,
  signOutCustomer,
} from '@/server/session';

export async function POST(request: Request): Promise<NextResponse> {
  const token = readSessionToken(request.headers.get('cookie'));
  await signOutCustomer(token);

  const response = NextResponse.redirect(new URL('/', request.url), 303);
  response.headers.append('Set-Cookie', clearSessionCookie());
  return response;
}
