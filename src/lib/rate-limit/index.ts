import 'server-only'
import { prisma } from '@/db/client'
import { RateLimitedError } from '@/lib/errors'
import { hashToken } from '@/lib/security/tokens'

/**
 * Fixed-window rate limiting.
 *
 * Production uses PostgreSQL so limits are shared by every app instance
 * (serverless functions, multiple containers) without extra infrastructure:
 * one atomic INSERT … ON CONFLICT per check. An in-memory limiter exists for
 * single-process tests only (env validation forbids it in production).
 *
 * Keys are HMAC-hashed before storage so the table never holds raw IPs or emails.
 */

export interface RateLimitRule {
  /** Logical bucket name, e.g. "login:ip". */
  name: string
  limit: number
  windowSeconds: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export interface RateLimiter {
  consume(key: string, rule: RateLimitRule): Promise<RateLimitResult>
  reset(key: string, rule: RateLimitRule): Promise<void>
}

function bucketKey(rule: RateLimitRule, subject: string): string {
  return `${rule.name}:${hashToken(`${rule.name}|${subject}`).slice(0, 40)}`
}

class PostgresRateLimiter implements RateLimiter {
  async consume(subject: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const key = bucketKey(rule, subject)
    const rows = await prisma.$queryRaw<{ count: number; expires_at: Date }[]>`
      INSERT INTO rate_limit_buckets (key, count, window_start, expires_at)
      VALUES (${key}, 1, now(), now() + make_interval(secs => ${rule.windowSeconds}))
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limit_buckets.expires_at <= now() THEN 1 ELSE rate_limit_buckets.count + 1 END,
        window_start = CASE WHEN rate_limit_buckets.expires_at <= now() THEN now() ELSE rate_limit_buckets.window_start END,
        expires_at = CASE WHEN rate_limit_buckets.expires_at <= now()
                          THEN now() + make_interval(secs => ${rule.windowSeconds})
                          ELSE rate_limit_buckets.expires_at END
      RETURNING count, expires_at`
    const row = rows[0]
    if (!row) throw new Error('rate limiter upsert returned no row')
    const count = Number(row.count)
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((new Date(row.expires_at).getTime() - Date.now()) / 1000),
    )
    return {
      allowed: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds,
    }
  }

  async reset(subject: string, rule: RateLimitRule): Promise<void> {
    await prisma.rateLimitBucket.deleteMany({ where: { key: bucketKey(rule, subject) } })
  }
}

class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, { count: number; expiresAt: number }>()

  async consume(subject: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const key = bucketKey(rule, subject)
    const now = Date.now()
    const existing = this.buckets.get(key)
    const bucket =
      existing && existing.expiresAt > now
        ? { ...existing, count: existing.count + 1 }
        : { count: 1, expiresAt: now + rule.windowSeconds * 1000 }
    this.buckets.set(key, bucket)
    return {
      allowed: bucket.count <= rule.limit,
      remaining: Math.max(0, rule.limit - bucket.count),
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000)),
    }
  }

  async reset(subject: string, rule: RateLimitRule): Promise<void> {
    this.buckets.delete(bucketKey(rule, subject))
  }
}

let limiter: RateLimiter | undefined

export function getRateLimiter(): RateLimiter {
  limiter ??=
    process.env.RATE_LIMIT_PROVIDER === 'memory'
      ? new MemoryRateLimiter()
      : new PostgresRateLimiter()
  return limiter
}

/** Test hook. */
export function setRateLimiter(next: RateLimiter | undefined): void {
  limiter = next
}

/** Consume one unit from every rule; throws RateLimitedError if any rule is exhausted. */
export async function enforceRateLimits(
  checks: Array<{ rule: RateLimitRule; subject: string }>,
): Promise<void> {
  const limiterInstance = getRateLimiter()
  let worst: RateLimitResult | undefined
  for (const { rule, subject } of checks) {
    const result = await limiterInstance.consume(subject, rule)
    if (!result.allowed && (!worst || result.retryAfterSeconds > worst.retryAfterSeconds))
      worst = result
  }
  if (worst) throw new RateLimitedError(worst.retryAfterSeconds)
}

/** Central catalogue of limits so they are reviewed in one place. */
export const RATE_LIMITS = {
  loginIp: { name: 'login:ip', limit: 30, windowSeconds: 10 * 60 },
  loginAccount: { name: 'login:account', limit: 8, windowSeconds: 15 * 60 },
  register: { name: 'register:ip', limit: 10, windowSeconds: 60 * 60 },
  forgotPasswordIp: { name: 'forgot:ip', limit: 10, windowSeconds: 15 * 60 },
  forgotPasswordAccount: { name: 'forgot:account', limit: 3, windowSeconds: 60 * 60 },
  resetPassword: { name: 'reset:ip', limit: 10, windowSeconds: 15 * 60 },
  verifyEmail: { name: 'verify:ip', limit: 20, windowSeconds: 15 * 60 },
  resendVerification: { name: 'verify-resend:user', limit: 3, windowSeconds: 60 * 60 },
  changePassword: { name: 'password-change:user', limit: 5, windowSeconds: 15 * 60 },
  contact: { name: 'contact:ip', limit: 5, windowSeconds: 60 * 60 },
  newsletter: { name: 'newsletter:ip', limit: 10, windowSeconds: 60 * 60 },
  coupon: { name: 'coupon:subject', limit: 20, windowSeconds: 10 * 60 },
  cartWrite: { name: 'cart:subject', limit: 120, windowSeconds: 60 },
  checkout: { name: 'checkout:user', limit: 10, windowSeconds: 10 * 60 },
  paymentInit: { name: 'payment:user', limit: 10, windowSeconds: 10 * 60 },
  search: { name: 'search:ip', limit: 120, windowSeconds: 60 },
  reviews: { name: 'review:user', limit: 10, windowSeconds: 60 * 60 },
  uploads: { name: 'upload:user', limit: 60, windowSeconds: 10 * 60 },
  webhook: { name: 'webhook:ip', limit: 600, windowSeconds: 60 },
  adminWrite: { name: 'admin:user', limit: 600, windowSeconds: 10 * 60 },
} as const satisfies Record<string, RateLimitRule>
