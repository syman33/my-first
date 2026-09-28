import 'server-only'
import { type Algorithm, hash, verify } from '@node-rs/argon2'
import { logger } from '@/lib/logger'

/**
 * Password hashing with Argon2id using the OWASP-recommended baseline
 * (m=19 MiB, t=2, p=1). Plaintext passwords are never stored or logged.
 */
// `Algorithm` is an ambient const enum (not accessible under isolatedModules); 2 === Algorithm.Argon2id.
const ARGON2ID = 2 as Algorithm

const PARAMS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length > PASSWORD_MAX_LENGTH) throw new Error('Password exceeds maximum length')
  return hash(plain, PARAMS)
}

/** Constant-time verification. Malformed hashes verify as false (and are logged, without the hash). */
export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  if (plain.length > PASSWORD_MAX_LENGTH) return false
  try {
    return await verify(passwordHash, plain)
  } catch (error) {
    logger.error('auth.password_verify_failed', { error: error instanceof Error ? error.message : 'unknown' })
    return false
  }
}

/** True when the stored hash was produced with weaker parameters than today's baseline. */
export function needsRehash(passwordHash: string): boolean {
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(passwordHash)
  if (!match) return true
  const [, m, t, p] = match.map(Number)
  return m! < PARAMS.memoryCost || t! < PARAMS.timeCost || p! !== PARAMS.parallelism
}

let dummyHash: Promise<string> | undefined

/**
 * Run a real verification against a throwaway hash when the account does not
 * exist, so response timing does not reveal which emails are registered.
 */
export async function burnPasswordVerification(plain: string): Promise<void> {
  dummyHash ??= hash('velora-timing-equalizer', PARAMS)
  await verifyPassword(await dummyHash, plain.slice(0, PASSWORD_MAX_LENGTH))
}

/** Frequently breached passwords (lower-cased). Blocked regardless of other rules. */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'passwort',
  '12345678', '123456789', '1234567890', '12341234', '11111111', '00000000', '88888888', '87654321',
  '12121212', '123123123', '11223344', '1q2w3e4r', '1qaz2wsx', 'qwertyui', 'qwertyuiop', 'qwerty123',
  'asdfghjkl', 'zxcvbnm1', 'abc12345', 'abcd1234', 'aa123456', 'iloveyou', 'sunshine', 'princess',
  'football', 'baseball', 'welcome1', 'welcome123', 'admin123', 'administrator', 'letmein1', 'trustno1',
  'superman', 'starwars', 'whatever', 'dragon12', 'monkey12', 'master12', 'changeme', 'changeme1',
  'computer', 'internet', 'samsung1', 'iphone12', 'mohammed', 'mohammad', 'muhammad', 'abdullah',
  'alhamdulillah', 'bismillah', 'saudi123', 'riyadh123', 'jeddah123', 'ksa12345', 'velora123', 'velora2026',
])

export type PasswordProblem = 'passwordTooShort' | 'passwordTooLong' | 'passwordTooCommon'

/**
 * NIST SP 800-63B style policy: length and breach-list checks, no arbitrary
 * composition rules. Returns the dictionary key describing the problem.
 */
export function checkPasswordPolicy(password: string, context: { email?: string } = {}): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) return 'passwordTooShort'
  if (password.length > PASSWORD_MAX_LENGTH) return 'passwordTooLong'
  const lowered = password.toLowerCase()
  if (COMMON_PASSWORDS.has(lowered)) return 'passwordTooCommon'
  if (/^(.)\1+$/.test(password)) return 'passwordTooCommon'
  const localPart = context.email?.split('@')[0]?.toLowerCase()
  if (localPart && localPart.length >= 4 && lowered === localPart) return 'passwordTooCommon'
  return null
}
