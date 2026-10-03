import 'server-only'
import { type DbClient } from '@/db/client'
import { Prisma } from '@/generated/prisma/client'
import type { ActorType, RoleKey } from '@/generated/prisma/enums'
import { redact } from '@/lib/logger'

/**
 * Append-only audit trail for sensitive actions (catalogue, inventory,
 * orders, refunds, coupons, customers, staff accounts, settings, security).
 * Written inside the same transaction as the change it describes. Metadata is
 * redacted so secrets never land in the trail; the table itself rejects
 * UPDATE/DELETE via a database trigger.
 */

export interface AuditActor {
  id: string | null
  type: ActorType
}

export interface AuditContext {
  actor: AuditActor
  ipAddress?: string | null
  requestId?: string | null
}

export function actorFromRole(userId: string, role: RoleKey): AuditActor {
  return { id: userId, type: role === 'ADMIN' ? 'ADMIN' : role === 'STAFF' ? 'STAFF' : 'CUSTOMER' }
}

export const SYSTEM_ACTOR: AuditActor = { id: null, type: 'SYSTEM' }

export async function recordAudit(
  db: DbClient,
  context: AuditContext,
  entry: {
    action: string
    entityType: string
    entityId?: string | null
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: context.actor.id,
      actorType: context.actor.type,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata
        ? (redact(entry.metadata) as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      ipAddress: context.ipAddress ?? null,
      requestId: context.requestId ?? null,
    },
  })
}

/** Compact before/after diff of changed fields (for update audits). */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const [key, value] of Object.entries(after)) {
    const previous = before[key]
    const same =
      previous instanceof Date && value instanceof Date
        ? previous.getTime() === value.getTime()
        : JSON.stringify(previous) === JSON.stringify(value)
    if (!same) changes[key] = { from: previous, to: value }
  }
  return changes
}
