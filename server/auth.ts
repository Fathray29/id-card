import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Session signing secret: reads process.env.SESSION_SECRET, falling back to an ephemeral in-memory random key
const FALLBACK_SESSION_SECRET = crypto.randomBytes(32);

function getSessionSecret(): Buffer {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured && configured.length >= 16) {
    return Buffer.from(configured, 'utf8');
  }
  return FALLBACK_SESSION_SECRET;
}

export interface SessionClaims {
  uid: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  iat: number;
  exp: number;
}

export function normalizeEmail(raw: string): string {
  return (raw || '').trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length >= 5 && normalized.length <= 254 && EMAIL_PATTERN.test(normalized);
}

export function validatePassword(password: string): string | null {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 128) return 'Password must be 128 characters or fewer.';
  return null;
}

export function isAdminEmail(email: string): boolean {
  const configured = (process.env.ADMIN_EMAIL || 'fathray29@gmail.com').trim().toLowerCase();
  return Boolean(configured && normalizeEmail(email) === configured);
}

export function generateUserId(): string {
  return `usr_${crypto.randomBytes(12).toString('hex')}`;
}

/**
 * Hashes a password using Node's native scrypt KDF with a unique 16-byte random salt.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

const DUMMY_SALT = '00112233445566778899aabbccddeeff';

/**
 * Verifies a password against a stored `salt:hash` string in constant time.
 */
export async function verifyPassword(password: string, storedHash: string | null): Promise<boolean> {
  if (!storedHash || !storedHash.includes(':')) {
    // Burn comparable CPU time to prevent user-existence timing leaks
    await scryptAsync(password || 'dummy', DUMMY_SALT, 64);
    return false;
  }
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) {
    await scryptAsync(password || 'dummy', DUMMY_SALT, 64);
    return false;
  }
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const actualBuf = (await scryptAsync(password, salt, expectedBuf.length)) as Buffer;
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

export function signSessionToken(user: {
  uid: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
}): string {
  const now = Date.now();
  const payload: SessionClaims = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  const headerB64 = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(signingInput).digest();
  return `${signingInput}.${base64UrlEncode(sig)}`;
}

export function verifySessionToken(token: string | null | undefined): SessionClaims | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) return null;

  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = crypto.createHmac('sha256', getSessionSecret()).update(signingInput).digest();
  let providedSig: Buffer;
  try {
    providedSig = base64UrlDecode(sigB64);
  } catch {
    return null;
  }

  if (providedSig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(providedSig, expectedSig)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as SessionClaims;
    if (
      !parsed ||
      typeof parsed.uid !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.exp !== 'number' ||
      parsed.exp <= Date.now()
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || typeof authHeader !== 'string') return null;
  const match = /^Bearer\s+([A-Za-z0-9._-]+)$/.exec(authHeader.trim());
  return match ? match[1] : null;
}

/**
 * Lightweight sliding-window rate limiter to protect auth endpoints from brute-force attempts.
 */
export class AuthRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(maxAttempts = 25, windowMs = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  check(key: string): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) || []).filter((ts) => ts > cutoff);
    if (recent.length >= this.maxAttempts) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 2000) {
      for (const [k, list] of this.hits.entries()) {
        if (list.every((ts) => ts <= cutoff)) this.hits.delete(k);
      }
    }
    return true;
  }
}
