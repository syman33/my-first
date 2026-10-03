import 'server-only'
import { prisma, type DbClient } from '@/db/client'
import type { CouponFailureReason } from '@/lib/errors'
import type { CouponRule } from '@/lib/pricing/order-totals'

/**
 * Database-side coupon rules (existence, activation, schedule, usage limits,
 * customer eligibility). Basket-dependent rules (minimum order, eligible
 * items, maximum discount) are applied by the pricing engine.
 */
export type CouponResolution =
  { ok: true; couponId: string; rule: CouponRule } | { ok: false; reason: CouponFailureReason }

export async function resolveCoupon(
  code: string,
  options: { userId: string | null; now?: Date; db?: DbClient },
): Promise<CouponResolution> {
  const db = options.db ?? prisma
  const now = options.now ?? new Date()
  const normalized = code.trim()
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(normalized)) return { ok: false, reason: 'NOT_FOUND' }

  const coupon = await db.coupon.findUnique({
    where: { code: normalized },
    include: {
      products: { select: { productId: true } },
      categories: { select: { categoryId: true } },
    },
  })
  if (!coupon) return { ok: false, reason: 'NOT_FOUND' }
  if (!coupon.isActive) return { ok: false, reason: 'INACTIVE' }
  if (coupon.startsAt && coupon.startsAt > now) return { ok: false, reason: 'NOT_STARTED' }
  if (coupon.expiresAt && coupon.expiresAt <= now) return { ok: false, reason: 'EXPIRED' }
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    return { ok: false, reason: 'USAGE_LIMIT_REACHED' }
  }
  if (coupon.usageLimitPerUser !== null) {
    // Per-customer limits can only be enforced for signed-in customers.
    if (!options.userId) return { ok: false, reason: 'LOGIN_REQUIRED' }
    const used = await db.couponUsage.count({
      where: { couponId: coupon.id, userId: options.userId },
    })
    if (used >= coupon.usageLimitPerUser) return { ok: false, reason: 'USER_LIMIT_REACHED' }
  }
  return {
    ok: true,
    couponId: coupon.id,
    rule: {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      minOrderAmount: coupon.minOrderAmount,
      maxDiscountAmount: coupon.maxDiscountAmount,
      scope: coupon.scope,
      productIds: coupon.products.map((p) => p.productId),
      categoryIds: coupon.categories.map((c) => c.categoryId),
    },
  }
}
