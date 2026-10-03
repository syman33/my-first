import 'server-only'
import { prisma } from '@/db/client'
import { deleteExpiredSessions } from '@/services/auth/session.service'
import { addDays } from '@/utils/time'

/**
 * Housekeeping (idempotent, safe to run often): drop expired sessions,
 * tokens, rate-limit windows, idempotency records and abandoned guest
 * bags/wishlists. Business records (orders, ledger, audit) are never touched.
 */
export async function runCleanup(now: Date = new Date()): Promise<Record<string, number>> {
  const [sessions, tokens, buckets, idempotency, guestCarts, guestWishlists, outbox] =
    await Promise.all([
      deleteExpiredSessions(now),
      prisma.verificationToken
        .deleteMany({ where: { expiresAt: { lt: addDays(now, -7) } } })
        .then((r) => r.count),
      prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } }).then((r) => r.count),
      prisma.idempotencyKey.deleteMany({ where: { expiresAt: { lt: now } } }).then((r) => r.count),
      prisma.cart
        .deleteMany({ where: { userId: null, expiresAt: { lt: now } } })
        .then((r) => r.count),
      prisma.wishlist
        .deleteMany({ where: { userId: null, expiresAt: { lt: now } } })
        .then((r) => r.count),
      // Processed outbox rows are kept for 30 days for troubleshooting.
      prisma.outboxEvent
        .deleteMany({ where: { status: 'PROCESSED', processedAt: { lt: addDays(now, -30) } } })
        .then((r) => r.count),
    ])
  return { sessions, tokens, buckets, idempotency, guestCarts, guestWishlists, outbox }
}
