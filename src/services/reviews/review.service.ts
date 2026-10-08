import 'server-only'
import { prisma, type DbClient } from '@/db/client'
import { isUniqueViolation } from '@/db/errors'
import type { Prisma } from '@/generated/prisma/client'
import type { ReviewStatus } from '@/generated/prisma/enums'
import { AppError, NotFoundError } from '@/lib/errors'
import type { ReviewSubmission } from '@/schemas/reviews'
import { type AuditContext, recordAudit } from '@/services/audit/audit.service'
import { getSettings } from '@/services/settings/settings.service'

/**
 * Product reviews. By default only customers whose order with the product
 * was delivered may review it (settings: reviews.requireVerifiedPurchase),
 * one review per product per customer, published after moderation unless
 * auto-approval is switched on. The product's rating figures always come
 * from approved reviews only.
 */

export type ReviewEligibility =
  | { canReview: true; orderItemId: string | null; verified: boolean }
  | { canReview: false; reason: 'SIGN_IN' | 'NOT_PURCHASED' | 'ALREADY_REVIEWED' }

/** A delivered (or later refunded) line of this product bought by this customer. */
async function purchasedLine(db: DbClient, userId: string, productId: string) {
  return db.orderItem.findFirst({
    where: { productId, order: { userId, status: { in: ['DELIVERED', 'REFUNDED'] } } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
}

export async function reviewEligibility(
  userId: string | null,
  productId: string,
  db: DbClient = prisma,
): Promise<ReviewEligibility> {
  if (!userId) return { canReview: false, reason: 'SIGN_IN' }
  const [existing, line, settings] = await Promise.all([
    db.review.findUnique({
      where: { productId_userId: { productId, userId } },
      select: { id: true },
    }),
    purchasedLine(db, userId, productId),
    getSettings('reviews', db),
  ])
  if (existing) return { canReview: false, reason: 'ALREADY_REVIEWED' }
  if (!line && settings.requireVerifiedPurchase)
    return { canReview: false, reason: 'NOT_PURCHASED' }
  return { canReview: true, orderItemId: line?.id ?? null, verified: line !== null }
}

/** Recompute a product's rating from its approved reviews (average stored × 100). */
export async function refreshProductRating(db: DbClient, productId: string): Promise<void> {
  const stats = await db.review.aggregate({
    where: { productId, status: 'APPROVED' },
    _avg: { rating: true },
    _count: { _all: true },
  })
  const count = stats._count._all
  await db.product.update({
    where: { id: productId },
    data: {
      ratingCount: count,
      ratingAverage: count > 0 ? Math.round((stats._avg.rating ?? 0) * 100) : 0,
    },
  })
}

export async function submitReview(
  userId: string,
  productId: string,
  input: ReviewSubmission,
  locale: string,
  audit: AuditContext,
): Promise<{ id: string; status: ReviewStatus }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { status: true },
      })
      if (!product || product.status !== 'PUBLISHED')
        throw new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found')
      const eligibility = await reviewEligibility(userId, productId, tx)
      if (!eligibility.canReview) {
        throw new AppError(
          'REVIEW_NOT_ALLOWED',
          'This product cannot be reviewed by this account',
          {
            // Reviewing twice is a conflict (as when two submissions race); anything else is refused.
            status: eligibility.reason === 'ALREADY_REVIEWED' ? 409 : 403,
            details: { reason: eligibility.reason },
          },
        )
      }
      const { autoApprove } = await getSettings('reviews', tx)
      const status: ReviewStatus = autoApprove ? 'APPROVED' : 'PENDING'
      const review = await tx.review.create({
        data: {
          productId,
          userId,
          orderItemId: eligibility.orderItemId,
          isVerifiedPurchase: eligibility.verified,
          rating: input.rating,
          title: input.title,
          body: input.body,
          locale,
          status,
          moderatedAt: autoApprove ? new Date() : null,
        },
        select: { id: true, status: true },
      })
      if (status === 'APPROVED') await refreshProductRating(tx, productId)
      await recordAudit(tx, audit, {
        action: 'review.submitted',
        entityType: 'review',
        entityId: review.id,
        metadata: { productId, rating: input.rating, status },
      })
      return review
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('REVIEW_NOT_ALLOWED', 'Already reviewed', {
        status: 409,
        details: { reason: 'ALREADY_REVIEWED' },
      })
    }
    throw error
  }
}

export async function moderateReview(
  reviewId: string,
  input: { decision: 'APPROVED' | 'REJECTED'; reason: string | null },
  audit: AuditContext,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const review = await tx.review.findUnique({
      where: { id: reviewId },
      select: { productId: true, status: true },
    })
    if (!review) throw new NotFoundError()
    await tx.review.update({
      where: { id: reviewId },
      data: {
        status: input.decision,
        moderatedById: audit.actor.id,
        moderatedAt: new Date(),
        rejectionReason: input.decision === 'REJECTED' ? input.reason : null,
      },
    })
    await refreshProductRating(tx, review.productId)
    await recordAudit(tx, audit, {
      action: `review.${input.decision.toLowerCase()}`,
      entityType: 'review',
      entityId: reviewId,
      metadata: { productId: review.productId, from: review.status, reason: input.reason },
    })
  })
}

export async function listReviewsForAdmin(
  filters: { status?: ReviewStatus; q?: string },
  page: number,
  pageSize: number,
) {
  const and: Prisma.ReviewWhereInput[] = []
  if (filters.status) and.push({ status: filters.status })
  if (filters.q) {
    and.push({
      OR: [
        { body: { contains: filters.q, mode: 'insensitive' } },
        { title: { contains: filters.q, mode: 'insensitive' } },
        { product: { nameAr: { contains: filters.q, mode: 'insensitive' } } },
        { product: { nameEn: { contains: filters.q, mode: 'insensitive' } } },
        { user: { email: { contains: filters.q, mode: 'insensitive' } } },
      ],
    })
  }
  const where: Prisma.ReviewWhereInput = and.length > 0 ? { AND: and } : {}
  const [total, rows] = await prisma.$transaction([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        product: { select: { id: true, nameAr: true, nameEn: true } },
        user: { select: { name: true, email: true } },
        moderatedBy: { select: { name: true } },
      },
    }),
  ])
  return { total, rows }
}
