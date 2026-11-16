import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;

/**
 * Hash a password with scrypt and a per-user random salt. The stored value
 * carries its parameters so a future cost increase can verify old hashes.
 * Format: scrypt$N$r$p$salt(base64)$hash(base64)
 */
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length === 0) {
    throw new TypeError('password must be a non-empty string');
  }
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  const derived = await scrypt(password, salt, expected.length);

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Session tokens are stored only as a SHA-256 hash. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}
