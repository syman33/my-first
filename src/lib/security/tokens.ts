import 'server-only'
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

/**
 * Opaque-token helpers.
 *
 * Tokens (sessions, guest carts, password resets, email verification,
 * newsletter unsubscribe) are 256-bit random values. Only an HMAC of the token
 * is stored, keyed with AUTH_SECRET: a database leak does not reveal usable
 * tokens, and database write access alone cannot mint a valid one.
 */

function authSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 32)
    throw new Error('AUTH_SECRET must be configured (min 32 characters)')
  return secret
}

/** URL-safe random token (default 32 bytes = 256 bits). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** Deterministic HMAC-SHA256 (hex) used as the lookup key for a token. */
export function hashToken(token: string): string {
  return createHmac('sha256', authSecret()).update(token, 'utf8').digest('hex')
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

// ---- Sealing short-lived secrets (e.g. a reset link waiting in the outbox) ----

const SEAL_VERSION = 'v1'

function sealingKey(): Buffer {
  return Buffer.from(hkdfSync('sha256', authSecret(), 'velora-seal-salt', 'velora-outbox-seal', 32))
}

/** AES-256-GCM encrypt. Output: v1.<iv>.<tag>.<ciphertext> (base64url). */
export function sealSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', sealingKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    SEAL_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.')
}

export function unsealSecret(sealed: string): string {
  const [version, iv, tag, data] = sealed.split('.')
  if (version !== SEAL_VERSION || !iv || !tag || !data) throw new Error('Malformed sealed secret')
  const decipher = createDecipheriv('aes-256-gcm', sealingKey(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

/** Stable hash of a JSON-serialisable value (idempotency request fingerprints). */
export function fingerprint(value: unknown): string {
  return createHmac('sha256', 'velora-request-fingerprint')
    .update(stableStringify(value))
    .digest('hex')
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}
