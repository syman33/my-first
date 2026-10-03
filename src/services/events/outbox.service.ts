import 'server-only'
import { prisma, type DbClient } from '@/db/client'
import { type Prisma } from '@/generated/prisma/client'
import { logger } from '@/lib/logger'
import { emitAlert } from '@/lib/monitoring'
import {
  type OutboxEventInput,
  type OutboxEventType,
  type OutboxPayloads,
  SEALED_PAYLOAD_KEYS,
} from './types'

/**
 * Transactional outbox.
 *
 * `enqueueEvent` must be called with the same transaction client as the
 * business change, so the event exists if and only if the change committed.
 * `processOutbox` claims due events with FOR UPDATE SKIP LOCKED (safe with
 * many concurrent workers), runs the registered handlers and retries with
 * exponential backoff. Handlers must be idempotent (notifications are
 * deduplicated per event/channel/template by a unique constraint).
 */

export async function enqueueEvent<T extends OutboxEventType>(
  db: DbClient,
  event: OutboxEventInput<T>,
): Promise<string> {
  const row = await db.outboxEvent.create({
    data: {
      type: event.type,
      payload: event.payload as Prisma.InputJsonValue,
      aggregateType: event.aggregateType ?? null,
      aggregateId: event.aggregateId ?? null,
    },
    select: { id: true },
  })
  return row.id
}

export type OutboxHandler<T extends OutboxEventType> = (event: {
  id: string
  type: T
  payload: OutboxPayloads[T]
  attempt: number
}) => Promise<void>

type AnyHandler = (event: {
  id: string
  type: OutboxEventType
  payload: unknown
  attempt: number
}) => Promise<void>

const handlers = new Map<OutboxEventType, AnyHandler[]>()

export function registerOutboxHandler<T extends OutboxEventType>(
  type: T,
  handler: OutboxHandler<T>,
): void {
  const list = handlers.get(type) ?? []
  list.push(handler as unknown as AnyHandler)
  handlers.set(type, list)
}

/** Test hook. */
export function clearOutboxHandlers(): void {
  handlers.clear()
}

const STALE_LOCK_MS = 5 * 60_000

export function backoffMs(attempt: number): number {
  // 30s, 1m, 2m, 4m, … capped at 1h.
  return Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 60 * 60_000)
}

export interface OutboxRunResult {
  processed: number
  failed: number
  deadLettered: number
}

/** Process up to `limit` due events. Safe to run concurrently from several workers. */
export async function processOutbox(
  options: { limit?: number; now?: Date } = {},
): Promise<OutboxRunResult> {
  const limit = options.limit ?? 25
  const now = options.now ?? new Date()
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS)

  // Claim a batch atomically; stale PROCESSING rows (crashed worker) are reclaimed.
  const claimed = await prisma.$queryRaw<
    { id: string; type: string; payload: unknown; attempts: number; max_attempts: number }[]
  >`
    UPDATE outbox_events SET status = 'PROCESSING', locked_at = ${now}, attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM outbox_events
      WHERE (status = 'PENDING' AND next_attempt_at <= ${now})
         OR (status = 'PROCESSING' AND locked_at < ${staleBefore})
      ORDER BY created_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, type, payload, attempts, max_attempts`

  const result: OutboxRunResult = { processed: 0, failed: 0, deadLettered: 0 }
  for (const event of claimed) {
    const type = event.type as OutboxEventType
    try {
      for (const handler of handlers.get(type) ?? []) {
        await handler({ id: event.id, type, payload: event.payload, attempt: event.attempts })
      }
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          lockedAt: null,
          lastError: null,
          payload: purgeSealed(event.payload),
        },
      })
      result.processed++
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const dead = event.attempts >= event.max_attempts
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: dead ? 'FAILED' : 'PENDING',
          lockedAt: null,
          lastError: message.slice(0, 1000),
          nextAttemptAt: new Date(Date.now() + backoffMs(event.attempts)),
          ...(dead ? { payload: purgeSealed(event.payload) } : {}),
        },
      })
      if (dead) {
        result.deadLettered++
        emitAlert('outbox.event_dead_lettered', { eventId: event.id, type, error: message })
      } else {
        result.failed++
        logger.warn('outbox.handler_failed', {
          eventId: event.id,
          type,
          attempt: event.attempts,
          error: message,
        })
      }
    }
  }
  return result
}

function purgeSealed(payload: unknown): Prisma.InputJsonValue {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return (payload ?? {}) as Prisma.InputJsonValue
  const copy: Record<string, unknown> = { ...(payload as Record<string, unknown>) }
  for (const key of SEALED_PAYLOAD_KEYS) {
    if (key in copy) copy[key] = '[purged]'
  }
  return copy as Prisma.InputJsonValue
}
