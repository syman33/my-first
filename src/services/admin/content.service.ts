import 'server-only'
import { prisma } from '@/db/client'
import { isUniqueViolation } from '@/db/errors'
import type { Prisma } from '@/generated/prisma/client'
import { env } from '@/lib/env'
import { AppError, NotFoundError, ValidationError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import type { BannerInput, CouponInput, FaqInput, PageInput } from '@/schemas/admin-content'
import { type AuditContext, diffFields, recordAudit } from '@/services/audit/audit.service'
import { processUploadedImage } from '@/services/media/image-processing.service'
import { getStorage } from '@/services/storage/storage.service'

/** Coupons, banners, CMS pages and FAQ — every change audited. */

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

export async function listCoupons(
  filters: { q?: string; active?: boolean },
  page: number,
  pageSize: number,
) {
  const where: Prisma.CouponWhereInput = {
    ...(filters.q ? { code: { contains: filters.q, mode: 'insensitive' } } : {}),
    ...(filters.active === undefined ? {} : { isActive: filters.active }),
  }
  const [total, rows] = await prisma.$transaction([
    prisma.coupon.count({ where }),
    prisma.coupon.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])
  return { total, rows }
}

export async function getCoupon(couponId: string) {
  const coupon = await prisma.coupon.findUnique({
    where: { id: couponId },
    include: {
      products: { select: { product: { select: { sku: true } } } },
      categories: { select: { categoryId: true } },
      _count: { select: { usages: true } },
    },
  })
  if (!coupon) throw new NotFoundError()
  return coupon
}

export async function saveCoupon(
  couponId: string | null,
  input: CouponInput,
  audit: AuditContext,
): Promise<{ id: string }> {
  const { productSkus, categoryIds, ...fields } = input
  try {
    return await prisma.$transaction(async (tx) => {
      const products =
        input.scope === 'PRODUCTS'
          ? await tx.product.findMany({
              where: { sku: { in: productSkus } },
              select: { id: true, sku: true },
            })
          : []
      if (input.scope === 'PRODUCTS') {
        const found = new Set(products.map((product) => product.sku))
        const unknown = productSkus.filter((sku) => !found.has(sku))
        if (unknown.length > 0) {
          throw new AppError('VALIDATION_ERROR', 'Unknown SKUs', {
            status: 422,
            fieldErrors: { productSkus: 'unknownSku' },
            details: { skus: unknown.slice(0, 20) },
          })
        }
      }
      if (input.scope === 'CATEGORIES') {
        const count = await tx.category.count({ where: { id: { in: categoryIds } } })
        if (count !== new Set(categoryIds).size)
          throw new ValidationError({ categoryIds: 'invalid' })
      }
      const data = {
        ...fields,
        // A cap only makes sense on percentages.
        maxDiscountAmount: input.type === 'PERCENTAGE' ? input.maxDiscountAmount : null,
      }
      let id: string
      if (couponId) {
        const before = await tx.coupon.findUnique({ where: { id: couponId } })
        if (!before) throw new NotFoundError()
        if (input.usageLimit !== null && input.usageLimit < before.usedCount) {
          throw new ValidationError(
            { usageLimit: 'invalid' },
            'Usage limit is below the times already used',
          )
        }
        await tx.coupon.update({ where: { id: couponId }, data })
        await tx.couponProduct.deleteMany({ where: { couponId } })
        await tx.couponCategory.deleteMany({ where: { couponId } })
        id = couponId
        await recordAudit(tx, audit, {
          action: 'coupon.updated',
          entityType: 'coupon',
          entityId: id,
          metadata: { code: input.code, changes: diffFields(before, data) },
        })
      } else {
        id = (await tx.coupon.create({ data, select: { id: true } })).id
        await recordAudit(tx, audit, {
          action: 'coupon.created',
          entityType: 'coupon',
          entityId: id,
          metadata: { code: input.code },
        })
      }
      if (input.scope === 'PRODUCTS') {
        await tx.couponProduct.createMany({
          data: products.map((product) => ({ couponId: id, productId: product.id })),
        })
      }
      if (input.scope === 'CATEGORIES') {
        await tx.couponCategory.createMany({
          data: [...new Set(categoryIds)].map((categoryId) => ({ couponId: id, categoryId })),
        })
      }
      return { id }
    })
  } catch (error) {
    if (isUniqueViolation(error, 'code')) {
      throw new AppError('CONFLICT', 'Code already in use', {
        status: 409,
        fieldErrors: { code: 'codeTaken' },
      })
    }
    throw error
  }
}

/** Coupons that were used are kept for the order history: deactivate them instead. */
export async function deleteCoupon(couponId: string, audit: AuditContext): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const coupon = await tx.coupon.findUnique({
      where: { id: couponId },
      select: { code: true, _count: { select: { usages: true, orders: true } } },
    })
    if (!coupon) throw new NotFoundError()
    if (coupon._count.usages > 0 || coupon._count.orders > 0) {
      throw new AppError('CONFLICT', 'Used coupons are deactivated, not deleted', {
        status: 409,
        details: { reason: 'USED' },
      })
    }
    await tx.coupon.delete({ where: { id: couponId } })
    await recordAudit(tx, audit, {
      action: 'coupon.deleted',
      entityType: 'coupon',
      entityId: couponId,
      metadata: { code: coupon.code },
    })
  })
}

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------

/**
 * Banner images must be ours: bundled assets, files in our storage, or the
 * configured storage CDN — never arbitrary third-party URLs (which next/image
 * would refuse anyway).
 */
function assertOwnImage(url: string | null, field: 'imageUrl' | 'mobileImageUrl'): void {
  if (!url) return
  const cdn = env().STORAGE_PUBLIC_BASE_URL?.replace(/\/$/, '')
  const own =
    url.startsWith('/images/') ||
    url.startsWith('/uploads/') ||
    (cdn !== undefined && url.startsWith(`${cdn}/`))
  if (!own)
    throw new ValidationError(
      { [field]: 'url' },
      'Upload the image or use one of the store’s images',
    )
}

export async function listBanners() {
  return prisma.banner.findMany({
    orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
  })
}

export async function saveBanner(
  bannerId: string | null,
  input: BannerInput,
  audit: AuditContext,
): Promise<{ id: string }> {
  assertOwnImage(input.imageUrl, 'imageUrl')
  assertOwnImage(input.mobileImageUrl, 'mobileImageUrl')
  return prisma.$transaction(async (tx) => {
    if (bannerId) {
      const before = await tx.banner.findUnique({ where: { id: bannerId } })
      if (!before) throw new NotFoundError()
      await tx.banner.update({ where: { id: bannerId }, data: input })
      await recordAudit(tx, audit, {
        action: 'banner.updated',
        entityType: 'banner',
        entityId: bannerId,
        metadata: { changes: diffFields(before, input) },
      })
      return { id: bannerId }
    }
    const created = await tx.banner.create({ data: input, select: { id: true } })
    await recordAudit(tx, audit, {
      action: 'banner.created',
      entityType: 'banner',
      entityId: created.id,
      metadata: { placement: input.placement },
    })
    return created
  })
}

export async function deleteBanner(bannerId: string, audit: AuditContext): Promise<void> {
  const banner = await prisma.$transaction(async (tx) => {
    const found = await tx.banner.findUnique({
      where: { id: bannerId },
      select: { imageKey: true, titleEn: true },
    })
    if (!found) throw new NotFoundError()
    await tx.banner.delete({ where: { id: bannerId } })
    await recordAudit(tx, audit, {
      action: 'banner.deleted',
      entityType: 'banner',
      entityId: bannerId,
      metadata: { title: found.titleEn },
    })
    return found
  })
  if (banner.imageKey) {
    const stillUsed = await prisma.banner.count({ where: { imageKey: banner.imageKey } })
    if (stillUsed === 0) {
      await getStorage()
        .delete(banner.imageKey)
        .catch((error: unknown) =>
          logger.warn('storage.delete_failed', { key: banner.imageKey, error }),
        )
    }
  }
}

/** Upload a banner image (validated and re-encoded like product photos). */
export async function uploadBannerImage(
  bytes: Uint8Array,
  audit: AuditContext,
): Promise<{ url: string; key: string }> {
  const image = await processUploadedImage(bytes, { maxEdge: 2800, minEdge: 600 })
  const key = `banners/${image.hash}.${image.extension}`
  const stored = await getStorage().put(key, image.data, image.contentType)
  await recordAudit(prisma, audit, {
    action: 'banner.image_uploaded',
    entityType: 'banner',
    metadata: { key, width: image.width, height: image.height },
  })
  return stored
}

// ---------------------------------------------------------------------------
// Pages and FAQ
// ---------------------------------------------------------------------------

export async function listPages() {
  return prisma.page.findMany({
    orderBy: { slug: 'asc' },
    include: { updatedBy: { select: { name: true } } },
  })
}

export async function getPageForEdit(slug: string) {
  const page = await prisma.page.findUnique({ where: { slug } })
  if (!page) throw new NotFoundError()
  return page
}

/** Pages are the store's fixed policy and information pages; their addresses never change. */
export async function savePage(slug: string, input: PageInput, audit: AuditContext): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const before = await tx.page.findUnique({ where: { slug } })
    if (!before) throw new NotFoundError()
    await tx.page.update({ where: { slug }, data: { ...input, updatedById: audit.actor.id } })
    const { contentAr: _a, contentEn: _b, ...comparable } = input
    await recordAudit(tx, audit, {
      action: 'page.updated',
      entityType: 'page',
      entityId: before.id,
      metadata: {
        slug,
        contentChanged:
          before.contentAr !== input.contentAr || before.contentEn !== input.contentEn,
        changes: diffFields(before, comparable),
      },
    })
  })
}

export async function listFaq() {
  return prisma.faqItem.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
}

export async function saveFaq(
  faqId: string | null,
  input: FaqInput,
  audit: AuditContext,
): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    if (faqId) {
      const before = await tx.faqItem.findUnique({ where: { id: faqId } })
      if (!before) throw new NotFoundError()
      await tx.faqItem.update({ where: { id: faqId }, data: input })
      await recordAudit(tx, audit, {
        action: 'faq.updated',
        entityType: 'faq',
        entityId: faqId,
        metadata: { changes: diffFields(before, input) },
      })
      return { id: faqId }
    }
    const created = await tx.faqItem.create({ data: input, select: { id: true } })
    await recordAudit(tx, audit, { action: 'faq.created', entityType: 'faq', entityId: created.id })
    return created
  })
}

export async function deleteFaq(faqId: string, audit: AuditContext): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const found = await tx.faqItem.findUnique({
      where: { id: faqId },
      select: { questionEn: true },
    })
    if (!found) throw new NotFoundError()
    await tx.faqItem.delete({ where: { id: faqId } })
    await recordAudit(tx, audit, {
      action: 'faq.deleted',
      entityType: 'faq',
      entityId: faqId,
      metadata: { question: found.questionEn },
    })
  })
}
