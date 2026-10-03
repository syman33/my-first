import 'server-only'
import { prisma } from '@/db/client'
import type { Prisma } from '@/generated/prisma/client'
import type { UserStatus } from '@/generated/prisma/enums'
import { SALE_STATUSES } from '@/lib/admin/metrics'
import { AppError, NotFoundError } from '@/lib/errors'
import { normalizeSaudiMobile } from '@/schemas/common'
import { type AuditContext, recordAudit } from '@/services/audit/audit.service'
import { invalidateUserSessions } from '@/services/auth/session.service'

/**
 * Customer records for the back office. Password hashes and tokens are never
 * selected; staff accounts are managed on the staff page, not here.
 */

const customerFields = {
  id: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  locale: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect

export async function listCustomers(
  filters: { q?: string; status?: UserStatus },
  page: number,
  pageSize: number,
) {
  const and: Prisma.UserWhereInput[] = [{ role: 'CUSTOMER' }]
  if (filters.status) and.push({ status: filters.status })
  if (filters.q) {
    const phone = normalizeSaudiMobile(filters.q)
    and.push({
      OR: [
        { name: { contains: filters.q, mode: 'insensitive' } },
        { email: { contains: filters.q, mode: 'insensitive' } },
        ...(phone ? [{ phone }] : []),
      ],
    })
  }
  const where: Prisma.UserWhereInput = { AND: and }
  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: customerFields,
    }),
  ])
  const stats = users.length
    ? await prisma.order.groupBy({
        by: ['userId'],
        where: { userId: { in: users.map((user) => user.id) }, status: { in: [...SALE_STATUSES] } },
        _count: { _all: true },
        _sum: { total: true },
      })
    : []
  const byUser = new Map(stats.map((row) => [row.userId, row]))
  return {
    total,
    rows: users.map((user) => ({
      ...user,
      orders: byUser.get(user.id)?._count._all ?? 0,
      spent: byUser.get(user.id)?._sum.total ?? 0,
    })),
  }
}

export async function getCustomer(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'CUSTOMER' },
    select: {
      ...customerFields,
      addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] },
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          total: true,
          createdAt: true,
        },
      },
      _count: { select: { orders: true, reviews: true, returnRequests: true } },
    },
  })
  if (!user) throw new NotFoundError()
  const [sales, subscriber] = await Promise.all([
    prisma.order.aggregate({
      where: { userId, status: { in: [...SALE_STATUSES] } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.newsletterSubscriber.findUnique({
      where: { email: user.email },
      select: { status: true },
    }),
  ])
  return {
    ...user,
    lifetimeValue: sales._sum.total ?? 0,
    paidOrders: sales._count._all,
    newsletter: subscriber?.status ?? null,
  }
}

/** Suspend or reactivate a customer. Suspending signs them out everywhere at once. */
export async function setCustomerStatus(
  userId: string,
  status: UserStatus,
  reason: string,
  audit: AuditContext,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { role: true, status: true, email: true },
    })
    if (!user || user.role !== 'CUSTOMER') throw new NotFoundError()
    if (user.status === status) return
    await tx.user.update({ where: { id: userId }, data: { status } })
    if (status === 'SUSPENDED') await invalidateUserSessions(userId, {}, tx)
    await recordAudit(tx, audit, {
      action: status === 'SUSPENDED' ? 'customer.suspended' : 'customer.reactivated',
      entityType: 'user',
      entityId: userId,
      metadata: { reason },
    })
  })
}

// ---------------------------------------------------------------------------
// Contact messages and newsletter
// ---------------------------------------------------------------------------

export async function listMessages(
  filters: { q?: string; status?: 'NEW' | 'READ' | 'ARCHIVED' },
  page: number,
  pageSize: number,
) {
  const and: Prisma.ContactMessageWhereInput[] = []
  if (filters.status) and.push({ status: filters.status })
  else and.push({ status: { not: 'ARCHIVED' } })
  if (filters.q) {
    and.push({
      OR: [
        { name: { contains: filters.q, mode: 'insensitive' } },
        { email: { contains: filters.q, mode: 'insensitive' } },
        { subject: { contains: filters.q, mode: 'insensitive' } },
      ],
    })
  }
  const where: Prisma.ContactMessageWhereInput = { AND: and }
  const [total, rows] = await prisma.$transaction([
    prisma.contactMessage.count({ where }),
    prisma.contactMessage.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, name: true, email: true, subject: true, status: true, createdAt: true },
    }),
  ])
  return { total, rows }
}

/** A contact message (reading has no side effects; the page marks it read once shown). */
export async function getMessage(messageId: string) {
  const message = await prisma.contactMessage.findUnique({ where: { id: messageId } })
  if (!message) throw new NotFoundError()
  return message
}

export async function setMessageStatus(
  messageId: string,
  status: 'NEW' | 'READ' | 'ARCHIVED',
  audit: AuditContext,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const message = await tx.contactMessage.findUnique({
      where: { id: messageId },
      select: { status: true },
    })
    if (!message) throw new NotFoundError()
    await tx.contactMessage.update({ where: { id: messageId }, data: { status } })
    await recordAudit(tx, audit, {
      action: `message.${status.toLowerCase()}`,
      entityType: 'contact_message',
      entityId: messageId,
      metadata: { from: message.status },
    })
  })
}

export async function listSubscribers(
  filters: { q?: string; status?: 'SUBSCRIBED' | 'UNSUBSCRIBED' },
  page: number,
  pageSize: number,
) {
  const where: Prisma.NewsletterSubscriberWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q ? { email: { contains: filters.q, mode: 'insensitive' } } : {}),
  }
  const [total, rows] = await prisma.$transaction([
    prisma.newsletterSubscriber.count({ where }),
    prisma.newsletterSubscriber.findMany({
      where,
      orderBy: [{ subscribedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      // The unsubscribe token hash is never selected.
      select: {
        id: true,
        email: true,
        locale: true,
        status: true,
        source: true,
        subscribedAt: true,
        unsubscribedAt: true,
      },
    }),
  ])
  return { total, rows }
}

/** Every subscribed address, for export (a privacy-relevant action, so it is audited). */
export async function exportSubscribers(audit: AuditContext) {
  const rows = await prisma.newsletterSubscriber.findMany({
    where: { status: 'SUBSCRIBED' },
    orderBy: { subscribedAt: 'asc' },
    select: { email: true, locale: true, source: true, subscribedAt: true },
  })
  await recordAudit(prisma, audit, {
    action: 'newsletter.exported',
    entityType: 'newsletter',
    metadata: { count: rows.length },
  })
  return rows
}

/** Remove someone from the list on their request (e.g. by email to customer care). */
export async function unsubscribeByStaff(subscriberId: string, audit: AuditContext): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const subscriber = await tx.newsletterSubscriber.findUnique({
      where: { id: subscriberId },
      select: { status: true },
    })
    if (!subscriber) throw new NotFoundError()
    if (subscriber.status === 'UNSUBSCRIBED') {
      throw new AppError('CONFLICT', 'Already unsubscribed', { status: 409 })
    }
    await tx.newsletterSubscriber.update({
      where: { id: subscriberId },
      data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
    })
    await recordAudit(tx, audit, {
      action: 'newsletter.unsubscribed_by_staff',
      entityType: 'newsletter',
      entityId: subscriberId,
    })
  })
}
