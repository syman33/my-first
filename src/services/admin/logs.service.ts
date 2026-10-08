import 'server-only'
import { prisma } from '@/db/client'
import type { Prisma } from '@/generated/prisma/client'
import type { ActorType, NotificationChannel, NotificationStatus } from '@/generated/prisma/enums'
import { AppError, NotFoundError } from '@/lib/errors'
import { type AuditContext, recordAudit } from '@/services/audit/audit.service'

/** Read-only views of the audit trail and the notification log, plus resending failed messages. */

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export const AUDIT_ENTITY_TYPES = [
  'order',
  'payment',
  'refund',
  'return',
  'product',
  'variant',
  'category',
  'brand',
  'coupon',
  'banner',
  'page',
  'faq',
  'review',
  'user',
  'role',
  'settings',
  'newsletter',
  'contact_message',
  'notification',
] as const
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number]

export interface AuditLogFilters {
  q?: string
  actorType?: ActorType
  actorId?: string
  entityType?: AuditEntityType
  from?: Date
  /** Exclusive upper bound. */
  to?: Date
}

export async function listAuditLogs(filters: AuditLogFilters, page: number, pageSize: number) {
  const and: Prisma.AuditLogWhereInput[] = []
  if (filters.actorType) and.push({ actorType: filters.actorType })
  if (filters.actorId) and.push({ actorId: filters.actorId })
  if (filters.entityType) and.push({ entityType: filters.entityType })
  if (filters.from) and.push({ createdAt: { gte: filters.from } })
  if (filters.to) and.push({ createdAt: { lt: filters.to } })
  if (filters.q) {
    and.push({
      OR: [
        { action: { contains: filters.q, mode: 'insensitive' } },
        { entityId: filters.q },
        { requestId: filters.q },
      ],
    })
  }
  const where: Prisma.AuditLogWhereInput = and.length > 0 ? { AND: and } : {}
  const [total, rows] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { actor: { select: { id: true, name: true, email: true, role: true } } },
    }),
  ])
  // Users referenced by entries link to the customer or the team page depending on their role.
  const userIds = [
    ...new Set(
      rows.flatMap((row) =>
        row.entityType === 'user' && row.entityId && /^[0-9a-f-]{36}$/i.test(row.entityId)
          ? [row.entityId]
          : [],
      ),
    ),
  ]
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, role: true, name: true },
      })
    : []
  return { total, rows, users: new Map(users.map((user) => [user.id, user])) }
}

/** Where an audit entry's subject can be opened in the back office (null when it has no page). */
export function auditEntityHref(
  entityType: string,
  entityId: string | null,
  userRole?: 'CUSTOMER' | 'STAFF' | 'ADMIN',
): string | null {
  if (!entityId) return null
  switch (entityType) {
    case 'order':
      return `/admin/orders/${entityId}`
    case 'product':
      return `/admin/products/${entityId}`
    case 'return':
      return `/admin/returns/${entityId}`
    case 'variant':
      return `/admin/inventory/${entityId}`
    case 'contact_message':
      return `/admin/messages/${entityId}`
    case 'settings':
      return `/admin/settings?group=${encodeURIComponent(entityId)}`
    case 'user':
      if (!userRole) return null
      return userRole === 'CUSTOMER' ? `/admin/customers/${entityId}` : '/admin/staff'
    case 'role':
      return '/admin/staff'
    case 'coupon':
      return '/admin/coupons'
    case 'banner':
      return '/admin/banners'
    case 'page':
      return '/admin/pages'
    case 'faq':
      return '/admin/faq'
    case 'category':
      return '/admin/categories'
    case 'brand':
      return '/admin/brands'
    case 'review':
      return '/admin/reviews'
    case 'newsletter':
      return '/admin/newsletter'
    case 'notification':
      return '/admin/notifications'
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface NotificationFilters {
  q?: string
  status?: NotificationStatus
  channel?: NotificationChannel
}

export async function listNotifications(
  filters: NotificationFilters,
  page: number,
  pageSize: number,
) {
  const and: Prisma.NotificationWhereInput[] = []
  if (filters.status) and.push({ status: filters.status })
  if (filters.channel) and.push({ channel: filters.channel })
  if (filters.q) {
    and.push({
      OR: [
        { recipient: { contains: filters.q, mode: 'insensitive' } },
        { template: { contains: filters.q, mode: 'insensitive' } },
      ],
    })
  }
  const where: Prisma.NotificationWhereInput = and.length > 0 ? { AND: and } : {}
  const [total, rows, failed] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { outboxEvent: { select: { status: true, payload: true } } },
    }),
    prisma.notification.count({ where: { status: 'FAILED' } }),
  ])
  return {
    total,
    failed,
    rows: rows.map(({ outboxEvent, ...row }) => ({
      ...row,
      retry: retryability(row.status, outboxEvent),
    })),
  }
}

export type Retryability = 'RETRYABLE' | 'SCHEDULED' | 'LINK_EXPIRED' | 'NOT_FAILED' | 'NO_EVENT'

/**
 * Whether a failed message can be sent again by re-running its outbox event.
 * Every outbox handler only sends notifications, idempotently per (event,
 * channel, template), so re-running an event re-sends just what failed.
 */
export function retryability(
  status: NotificationStatus,
  event: { status: string; payload: unknown } | null,
): Retryability {
  if (status !== 'FAILED') return 'NOT_FAILED'
  if (!event) return 'NO_EVENT'
  if (event.status === 'PENDING' || event.status === 'PROCESSING') return 'SCHEDULED'
  // Secure links (password reset, invitations…) are erased once an event finishes or gives up.
  const payload = event.payload
  if (
    payload &&
    typeof payload === 'object' &&
    Object.values(payload as Record<string, unknown>).includes('[purged]')
  ) {
    return 'LINK_EXPIRED'
  }
  return 'RETRYABLE'
}

/** Queue a failed message's event again; the outbox worker sends it on its next run. */
export async function retryNotification(
  notificationId: string,
  audit: AuditContext,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const notification = await tx.notification.findUnique({
      where: { id: notificationId },
      include: { outboxEvent: { select: { id: true, status: true, payload: true } } },
    })
    if (!notification) throw new NotFoundError()
    const verdict = retryability(notification.status, notification.outboxEvent)
    if (verdict !== 'RETRYABLE' || !notification.outboxEvent) {
      throw new AppError('CONFLICT', 'This message cannot be sent again', {
        status: 409,
        details: { reason: verdict },
      })
    }
    const requeued = await tx.outboxEvent.updateMany({
      where: { id: notification.outboxEvent.id, status: { in: ['PROCESSED', 'FAILED'] } },
      data: {
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(),
        lockedAt: null,
        processedAt: null,
        lastError: null,
      },
    })
    if (requeued.count !== 1) {
      throw new AppError('CONFLICT', 'Already queued', {
        status: 409,
        details: { reason: 'SCHEDULED' },
      })
    }
    await recordAudit(tx, audit, {
      action: 'notification.retry_requested',
      entityType: 'notification',
      entityId: notification.id,
      metadata: { template: notification.template, channel: notification.channel },
    })
  })
}
