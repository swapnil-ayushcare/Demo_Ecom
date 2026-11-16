import { NextResponse } from 'next/server';
import { safeInternalPath } from '@/server/redirects';
import { serializeSessionCookie, signInCustomer } from '@/server/session';

function refuse(request: Request, reason: 'invalid' | 'missing', next: string): NextResponse {
  const url = new URL('/sign-in', request.url);
  url.searchParams.set('error', reason);
  if (next !== '/account') {
    url.searchParams.set('next', next);
  }
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request): Promise<NextResponse> {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Send a form with an email and password.' }, { status: 400 });
  }

  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const next = safeInternalPath(form.get('next'), '/account');

  if (!email || !password || email.length > 320 || password.length > 512) {
    return refuse(request, 'missing', next);
  }

  const result = await signInCustomer(email, password);
  if (!result.ok) {
    return refuse(request, 'invalid', next);
  }

  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.headers.append('Set-Cookie', serializeSessionCookie(result.session));
  return response;
}
