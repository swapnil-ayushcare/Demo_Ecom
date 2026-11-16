import { query } from '@/server/db';
import { hashPassword } from '@/server/passwords';
import {
  establishSession,
  type EstablishedSession,
  type SessionUser,
} from '@/server/session';

export const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 200;
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 80;
const EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const EMAIL_TAKEN_MESSAGE =
  'An account with this email already exists. Sign in with it, or use a different email.';

export type SignUpField = 'name' | 'email' | 'password';
export type SignUpFieldErrors = Partial<Record<SignUpField, string>>;

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
}

export type SignUpResult =
  | { kind: 'created'; user: SessionUser; session: EstablishedSession }
  | { kind: 'invalid'; fieldErrors: SignUpFieldErrors }
  | { kind: 'duplicate'; message: string; fieldErrors: { email: string } };

interface NewUserRow {
  id: string;
  name: string;
  email: string;
  role: 'customer' | 'admin';
}

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function validateSignUpInput(input: unknown): {
  input: SignUpInput | null;
  fieldErrors: SignUpFieldErrors;
} {
  const raw = asRecord(input);
  const fieldErrors: SignUpFieldErrors = {};

  const name = readText(raw.name).trim().replace(/\s+/g, ' ');
  if (name.length === 0) {
    fieldErrors.name = 'Enter your name.';
  } else if (name.length < NAME_MIN_LENGTH) {
    fieldErrors.name = `Enter your full name, at least ${NAME_MIN_LENGTH} characters.`;
  } else if (name.length > NAME_MAX_LENGTH) {
    fieldErrors.name = `Keep your name to ${NAME_MAX_LENGTH} characters or fewer.`;
  }

  const email = readText(raw.email).trim().toLowerCase();
  if (email.length === 0) {
    fieldErrors.email = 'Enter your email address.';
  } else if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    fieldErrors.email = 'Enter a valid email address, like name@example.com.';
  }

  const password = readText(raw.password);
  if (password.length === 0) {
    fieldErrors.password = 'Choose a password.';
  } else if (password.length < PASSWORD_MIN_LENGTH) {
    fieldErrors.password = `Use at least ${PASSWORD_MIN_LENGTH} characters for your password.`;
  } else if (password.length > PASSWORD_MAX_LENGTH) {
    fieldErrors.password = `Use a password of ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { input: null, fieldErrors };
  }

  return { input: { name, email, password }, fieldErrors };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

/**
 * Create a customer account from untrusted form input.
 *
 * The plain password only ever lives in memory: it is hashed with scrypt and a
 * fresh per-user salt before the row is written. A successful sign-up also
 * creates a server-side session and returns the cookie attributes so the
 * route handler can set an HTTP-only cookie.
 */
export async function signUpCustomer(raw: unknown): Promise<SignUpResult> {
  const { input, fieldErrors } = validateSignUpInput(raw);
  if (!input) {
    return { kind: 'invalid', fieldErrors };
  }

  const existing = await query<{ id: string }>(
    'SELECT id FROM users WHERE lower(email) = $1 LIMIT 1',
    [input.email],
  );
  if (existing.rows.length > 0) {
    return {
      kind: 'duplicate',
      message: EMAIL_TAKEN_MESSAGE,
      fieldErrors: { email: EMAIL_TAKEN_MESSAGE },
    };
  }

  const passwordHash = await hashPassword(input.password);

  let user: NewUserRow;
  try {
    const inserted = await query<NewUserRow>(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'customer')
       RETURNING id, name, email, role`,
      [input.name, input.email, passwordHash],
    );
    user = inserted.rows[0];
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        kind: 'duplicate',
        message: EMAIL_TAKEN_MESSAGE,
        fieldErrors: { email: EMAIL_TAKEN_MESSAGE },
      };
    }
    throw error;
  }

  const session = await establishSession(user.id);

  return {
    kind: 'created',
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    session,
  };
}
