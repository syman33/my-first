import 'server-only'
import { createHash } from 'node:crypto'
import { prisma } from '@/db/client'
import { isUniqueViolation } from '@/db/errors'
import type { Prisma } from '@/generated/prisma/client'
import { AppError, BadRequestError } from '@/lib/errors'
import { addHours, addMinutes } from '@/utils/time'

/**
 * Idempotency for critical writes (spec §42). The client sends an
 * `Idempotency-Key` header (a UUID created once per checkout attempt):
 *
 *  - the first request runs and its successful response is stored;
 *  - a retry with the same key and body replays that response — no second
 *    order, reservation or payment;
 *  - the same key with a different body is rejected (409);
 *  - a retry while the first is still running is told to wait (409);
 *  - a crashed attempt's lock expires so the key can be retried.
 * Failed attempts release the key, so a corrected retry is possible.
 */

const KEY_PATTERN = /^[A-Za-z0-9_-]{16,100}$/
/** Matches `idempotency_keys.scope` (VARCHAR(80)); scopes may embed an entity id. */
export const IDEMPOTENCY_SCOPE_MAX_LENGTH = 80
const LOCK_MINUTES = 2
const RETENTION_HOURS = 24

export function readIdempotencyKey(headers: Headers): string {
  const key = headers.get('idempotency-key')?.trim()
  if (!key || !KEY_PATTERN.test(key)) {
    throw new BadRequestError('A valid Idempotency-Key header is required')
  }
  return key
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

export function requestFingerprint(body: unknown): string {
  return createHash('sha256').update(stableStringify(body)).digest('hex')
}

export type IdempotentOutcome<T> = { replayed: false; result: T } | { replayed: true; result: T }

export async function withIdempotency<T extends Prisma.InputJsonValue>(
  options: { scope: string; key: string; userId: string | null; body: unknown; now?: Date },
  run: () => Promise<T>,
): Promise<IdempotentOutcome<T>> {
  if (options.scope.length > IDEMPOTENCY_SCOPE_MAX_LENGTH) {
    // A programming error: fail loudly instead of as an opaque database error.
    throw new Error(`Idempotency scope longer than ${IDEMPOTENCY_SCOPE_MAX_LENGTH} characters`)
  }
  const now = options.now ?? new Date()
  const requestHash = requestFingerprint(options.body)
  const lockedUntil = addMinutes(now, LOCK_MINUTES)
  const where = { scope_key: { scope: options.scope, key: options.key } }

  let claimed = false
  try {
    await prisma.idempotencyKey.create({
      data: {
        scope: options.scope,
        key: options.key,
        userId: options.userId,
        requestHash,
        lockedUntil,
        expiresAt: addHours(now, RETENTION_HOURS),
      },
    })
    claimed = true
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
  }

  if (!claimed) {
    const existing = await prisma.idempotencyKey.findUnique({ where })
    if (!existing)
      throw new AppError('IDEMPOTENCY_IN_PROGRESS', 'Request is being processed', { status: 409 })
    if (existing.userId !== options.userId || existing.requestHash !== requestHash) {
      throw new AppError(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency key reused with a different request',
        { status: 409 },
      )
    }
    if (existing.status === 'COMPLETED')
      return { replayed: true, result: existing.responseBody as T }
    // Still running elsewhere — unless that attempt crashed and its lock lapsed.
    const takeover = await prisma.idempotencyKey.updateMany({
      where: { id: existing.id, status: 'IN_PROGRESS', lockedUntil: { lt: now } },
      data: { lockedUntil },
    })
    if (takeover.count === 0) {
      throw new AppError('IDEMPOTENCY_IN_PROGRESS', 'Request is being processed', { status: 409 })
    }
  }

  try {
    const result = await run()
    await prisma.idempotencyKey.update({
      where,
      data: {
        status: 'COMPLETED',
        responseStatus: 200,
        responseBody: result,
        completedAt: new Date(),
        lockedUntil: null,
      },
    })
    return { replayed: false, result }
  } catch (error) {
    // Nothing was committed by the failed attempt: free the key for a corrected retry.
    await prisma.idempotencyKey.deleteMany({
      where: { scope: options.scope, key: options.key, status: 'IN_PROGRESS' },
    })
    throw error
  }
}
