import { query } from './db';
import { hashToken, newOpaqueToken } from './passwords';

export const SESSION_COOKIE_NAME = 'demo_ecom_session';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  maxAge: number;
}

export interface EstablishedSession {
  userId: string;
  token: string;
  expiresAt: Date;
  cookie: {
    name: string;
    value: string;
    options: SessionCookieOptions;
  };
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'customer' | 'admin';
}

export interface EstablishSessionOptions {
  ttlSeconds?: number;
  secure?: boolean;
}

/**
 * Create a server-side session for a user and return the raw token plus the
 * cookie attributes. Only a SHA-256 hash of the token is written to the
 * sessions table, so a database dump cannot be replayed as a session.
 */
export async function establishSession(
  userId: string,
  options: EstablishSessionOptions = {},
): Promise<EstablishedSession> {
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const token = newOpaqueToken();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hashToken(token), expiresAt],
  );

  const secure =
    options.secure ?? (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false');

  return {
    userId,
    token,
    expiresAt,
    cookie: {
      name: SESSION_COOKIE_NAME,
      value: token,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        secure,
        path: '/',
        maxAge: ttlSeconds,
      },
    },
  };
}

export async function getSessionUser(token: string): Promise<SessionUser | null> {
  if (!token) {
    return null;
  }

  const result = await query<SessionUser>(
    `SELECT u.id, u.name, u.email, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()`,
    [hashToken(token)],
  );

  return result.rows[0] ?? null;
}

export async function revokeSession(token: string): Promise<void> {
  if (!token) {
    return;
  }
  await query(
    `UPDATE sessions SET revoked_at = now()
      WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashToken(token)],
  );
}

export function serializeSessionCookie(session: EstablishedSession): string {
  const { name, value, options } = session.cookie;
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${options.maxAge}`,
  ];
  if (options.secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function clearSessionCookie(secure = process.env.NODE_ENV === 'production'): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function readSessionToken(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === SESSION_COOKIE_NAME) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}
