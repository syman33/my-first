import 'server-only'
import { prisma } from '@/db/client'
import { AppError, NotFoundError, ValidationError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { type AuditContext, recordAudit } from '@/services/audit/audit.service'
import { processUploadedImage } from '@/services/media/image-processing.service'
import { getStorage } from '@/services/storage/storage.service'

/** Product photography: validated uploads, alt text in both languages, ordering. */

const MAX_IMAGES_PER_PRODUCT = 20

export async function addProductImage(
  productId: string,
  bytes: Uint8Array,
  alt: { altAr: string | null; altEn: string | null },
  audit: AuditContext,
): Promise<{ id: string; url: string }> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, sku: true, _count: { select: { images: true } } },
  })
  if (!product) throw new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found')
  if (product._count.images >= MAX_IMAGES_PER_PRODUCT) {
    throw new AppError('UPLOAD_REJECTED', 'Too many images for one product', {
      status: 422,
      details: { reason: 'TOO_MANY', max: MAX_IMAGES_PER_PRODUCT },
    })
  }
  const image = await processUploadedImage(bytes, { maxEdge: 2400, minEdge: 600 })
  const key = `products/${productId}/${image.hash}.${image.extension}`
  const existing = await prisma.productImage.findFirst({
    where: { productId, storageKey: key },
    select: { id: true, url: true },
  })
  // The same photo uploaded twice is stored once.
  if (existing) return existing
  const stored = await getStorage().put(key, image.data, image.contentType)
  return prisma.$transaction(async (tx) => {
    const last = await tx.productImage.aggregate({
      where: { productId },
      _max: { sortOrder: true },
    })
    const created = await tx.productImage.create({
      data: {
        productId,
        url: stored.url,
        storageKey: stored.key,
        altAr: alt.altAr,
        altEn: alt.altEn,
        width: image.width,
        height: image.height,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
      select: { id: true, url: true },
    })
    await recordAudit(tx, audit, {
      action: 'product.image_added',
      entityType: 'product',
      entityId: productId,
      metadata: { sku: product.sku, imageId: created.id, width: image.width, height: image.height },
    })
    return created
  })
}

export async function updateProductImage(
  imageId: string,
  alt: { altAr: string | null; altEn: string | null },
  audit: AuditContext,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const image = await tx.productImage.findUnique({
      where: { id: imageId },
      select: { productId: true },
    })
    if (!image) throw new NotFoundError()
    await tx.productImage.update({ where: { id: imageId }, data: alt })
    await recordAudit(tx, audit, {
      action: 'product.image_updated',
      entityType: 'product',
      entityId: image.productId,
      metadata: { imageId },
    })
  })
}

export async function reorderProductImages(
  productId: string,
  imageIds: string[],
  audit: AuditContext,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const images = await tx.productImage.findMany({ where: { productId }, select: { id: true } })
    const current = new Set(images.map((image) => image.id))
    if (
      imageIds.length !== current.size ||
      new Set(imageIds).size !== imageIds.length ||
      imageIds.some((id) => !current.has(id))
    ) {
      throw new ValidationError(
        { imageIds: 'invalid' },
        'Send every image of the product exactly once',
      )
    }
    for (const [index, id] of imageIds.entries()) {
      await tx.productImage.update({ where: { id }, data: { sortOrder: index } })
    }
    await recordAudit(tx, audit, {
      action: 'product.images_reordered',
      entityType: 'product',
      entityId: productId,
    })
  })
}

/** Remove an image. A published product keeps at least one image. */
export async function deleteProductImage(imageId: string, audit: AuditContext): Promise<void> {
  const removed = await prisma.$transaction(async (tx) => {
    const image = await tx.productImage.findUnique({
      where: { id: imageId },
      select: {
        productId: true,
        storageKey: true,
        product: { select: { status: true, sku: true } },
      },
    })
    if (!image) throw new NotFoundError()
    if (image.product.status === 'PUBLISHED') {
      const count = await tx.productImage.count({ where: { productId: image.productId } })
      if (count <= 1) {
        throw new AppError('CONFLICT', 'A published product needs at least one image', {
          status: 409,
          details: { reason: 'LAST_IMAGE' },
        })
      }
    }
    await tx.productImage.delete({ where: { id: imageId } })
    await recordAudit(tx, audit, {
      action: 'product.image_deleted',
      entityType: 'product',
      entityId: image.productId,
      metadata: { sku: image.product.sku, imageId },
    })
    return image
  })
  if (removed.storageKey) {
    const stillUsed = await prisma.productImage.count({ where: { storageKey: removed.storageKey } })
    if (stillUsed === 0) {
      await getStorage()
        .delete(removed.storageKey)
        .catch((error: unknown) =>
          logger.warn('storage.delete_failed', { key: removed.storageKey, error }),
        )
    }
  }
}
