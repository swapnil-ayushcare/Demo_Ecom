import { NextResponse } from 'next/server';
import { serializeSessionCookie } from '@/server/session';
import { signUpCustomer } from '@/features/accounts/sign-up/signUpCustomer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function readPayload(request: Request): Promise<unknown> {
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

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await readPayload(request);
  } catch {
    return NextResponse.json(
      {
        error: 'invalid_request',
        message: 'Send the form as JSON or form data.',
      },
      { status: 400 },
    );
  }

  try {
    const result = await signUpCustomer(payload);

    if (result.kind === 'invalid') {
      return NextResponse.json(
        {
          error: 'validation_failed',
          message: 'Please correct the highlighted fields.',
          fieldErrors: result.fieldErrors,
        },
        { status: 422 },
      );
    }

    if (result.kind === 'duplicate') {
      return NextResponse.json(
        {
          error: 'email_taken',
          message: result.message,
          fieldErrors: result.fieldErrors,
        },
        { status: 409 },
      );
    }

    const response = NextResponse.json(
      { user: result.user, redirectTo: '/' },
      { status: 201 },
    );
    response.headers.append('Set-Cookie', serializeSessionCookie(result.session));
    return response;
  } catch (error) {
    console.error(
      'Sign-up failed:',
      error instanceof Error ? error.message : 'unknown error',
    );
    return NextResponse.json(
      {
        error: 'sign_up_failed',
        message: 'We could not create your account. Try again.',
      },
      { status: 500 },
    );
  }
}
