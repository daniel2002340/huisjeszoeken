import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing + session tokens for the dashboard login, using only
 * node:crypto (scrypt) — no extra dependency for ~6 known users.
 */

export const SESSION_TTL_DAYS = 30;
export const SESSION_COOKIE = 'session';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const candidate = scryptSync(password, salt, expected.length);
  return timingSafeEqual(candidate, expected);
}

export const newSessionToken = (): string => randomBytes(32).toString('hex');

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Attached to authenticated requests; profileId null = admin. */
export interface SessionAuth {
  token: string;
  profileId: number | null;
  name: string;
  admin: boolean;
}
