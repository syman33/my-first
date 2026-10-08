import 'server-only'
import { prisma, type DbClient } from '@/db/client'
import { isUniqueViolation } from '@/db/errors'
import { Prisma } from '@/generated/prisma/client'
import type { ProductStatus } from '@/generated/prisma/enums'
import { priceRange, productSearchDocument } from '@/lib/catalog/search-document'
import { AppError, NotFoundError, ValidationError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import type { ProductInput, VariantInput } from '@/schemas/admin-catalog'
import { type AuditContext, diffFields, recordAudit } from '@/services/audit/audit.service'
import { getStorage } from '@/services/storage/storage.service'
import type { AdminProductDetail, AdminProductRow } from '@/types/admin-catalog'

/**
 * Catalogue administration: products and their variants. Every write keeps
 * the denormalised fields the storefront relies on (price range, search
 * document) in step, enforces the publishing rules, and is audited.
 */

class ProductNotFoundError extends NotFoundError {
  constructor() {
    super('PRODUCT_NOT_FOUND', 'Product not found')
  }
}

/** Translate unique-index violations into field errors the form can show. */
function uniqueViolationToFieldError(error: unknown): never {
  if (isUniqueViolation(error, 'slug_ar'))
    throw new AppError('SLUG_TAKEN', 'Slug already in use', {
      status: 409,
      fieldErrors: { slugAr: 'slugTaken' },
    })
  if (isUniqueViolation(error, 'slug_en'))
    throw new AppError('SLUG_TAKEN', 'Slug already in use', {
      status: 409,
      fieldErrors: { slugEn: 'slugTaken' },
    })
  if (isUniqueViolation(error, 'barcode'))
    throw new AppError('SKU_TAKEN', 'Barcode already in use', {
      status: 409,
      fieldErrors: { barcode: 'barcodeTaken' },
    })
  if (isUniqueViolation(error, 'sku'))
    throw new AppError('SKU_TAKEN', 'SKU already in use', {
      status: 409,
      fieldErrors: { sku: 'skuTaken' },
    })
  throw error
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface AdminProductFilters {
  q?: string
  status?: ProductStatus
  categoryId?: string
  brandId?: string
  stock?: 'low' | 'out'
}

export async function listAdminProducts(
  filters: AdminProductFilters,
  page: number,
  pageSize: number,
): Promise<{ rows: AdminProductRow[]; total: number }> {
  const and: Prisma.ProductWhereInput[] = []
  if (filters.q) {
    and.push({
      OR: [
        { nameAr: { contains: filters.q, mode: 'insensitive' } },
        { nameEn: { contains: filters.q, mode: 'insensitive' } },
        { sku: { contains: filters.q, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: filters.q, mode: 'insensitive' } } } },
      ],
    })
  }
  if (filters.status) and.push({ status: filters.status })
  if (filters.categoryId) and.push({ categoryId: filters.categoryId })
  if (filters.brandId) and.push({ brandId: filters.brandId })
  if (filters.stock) {
    // Stock filters are evaluated in SQL (available = on_hand − reserved per active variant).
    const ids = await prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id
        FROM products p
        JOIN product_variants v ON v.product_id = p.id AND v.is_active
        JOIN inventory i ON i.variant_id = v.id
       GROUP BY p.id, p.low_stock_threshold
      HAVING ${
        filters.stock === 'out'
          ? Prisma.sql`SUM(i.on_hand - i.reserved) <= 0`
          : Prisma.sql`BOOL_OR(i.on_hand - i.reserved <= COALESCE(i.low_stock_threshold, p.low_stock_threshold))`
      }`
    and.push({ id: { in: ids.map((row) => row.id) } })
  }
  const where: Prisma.ProductWhereInput = and.length > 0 ? { AND: and } : {}
  const [total, products] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        sku: true,
        nameAr: true,
        nameEn: true,
        status: true,
        minPrice: true,
        maxPrice: true,
        lowStockThreshold: true,
        updatedAt: true,
        category: { select: { nameAr: true, nameEn: true } },
        images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
        variants: {
          where: { isActive: true },
          select: {
            inventory: { select: { onHand: true, reserved: true, lowStockThreshold: true } },
          },
        },
      },
    }),
  ])
  return {
    total,
    rows: products.map((product) => {
      const stock = product.variants.map((variant) => ({
        available: Math.max(
          (variant.inventory?.onHand ?? 0) - (variant.inventory?.reserved ?? 0),
          0,
        ),
        threshold: variant.inventory?.lowStockThreshold ?? product.lowStockThreshold,
      }))
      return {
        id: product.id,
        sku: product.sku,
        nameAr: product.nameAr,
        nameEn: product.nameEn,
        status: product.status,
        minPrice: product.minPrice,
        maxPrice: product.maxPrice,
        categoryNameAr: product.category.nameAr,
        categoryNameEn: product.category.nameEn,
        imageUrl: product.images[0]?.url ?? null,
        variantCount: product.variants.length,
        available: stock.reduce((sum, entry) => sum + entry.available, 0),
        lowStock: stock.some((entry) => entry.available <= entry.threshold),
        updatedAt: product.updatedAt,
      }
    }),
  }
}

export async function getAdminProduct(productId: string): Promise<AdminProductDetail> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      variants: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: { inventory: true },
      },
      images: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { orderItems: true } },
    },
  })
  if (!product) throw new ProductNotFoundError()
  const { variants, images, _count, searchText: _searchText, ...fields } = product
  return {
    id: fields.id,
    nameAr: fields.nameAr,
    nameEn: fields.nameEn,
    slugAr: fields.slugAr,
    slugEn: fields.slugEn,
    sku: fields.sku,
    descriptionAr: fields.descriptionAr,
    descriptionEn: fields.descriptionEn,
    price: fields.price,
    compareAtPrice: fields.compareAtPrice,
    cost: fields.cost,
    categoryId: fields.categoryId,
    brandId: fields.brandId,
    gender: fields.gender,
    materialAr: fields.materialAr,
    materialEn: fields.materialEn,
    careAr: fields.careAr,
    careEn: fields.careEn,
    lengthMm: fields.lengthMm,
    widthMm: fields.widthMm,
    heightMm: fields.heightMm,
    weightGrams: fields.weightGrams,
    isFeatured: fields.isFeatured,
    isBestseller: fields.isBestseller,
    isNewArrival: fields.isNewArrival,
    status: fields.status,
    lowStockThreshold: fields.lowStockThreshold,
    seoTitleAr: fields.seoTitleAr,
    seoTitleEn: fields.seoTitleEn,
    seoDescriptionAr: fields.seoDescriptionAr,
    seoDescriptionEn: fields.seoDescriptionEn,
    publishedAt: fields.publishedAt,
    createdAt: fields.createdAt,
    updatedAt: fields.updatedAt,
    hasOrders: _count.orderItems > 0,
    variants: variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      barcode: variant.barcode,
      nameAr: variant.nameAr,
      nameEn: variant.nameEn,
      colorFamily: variant.colorFamily,
      colorNameAr: variant.colorNameAr,
      colorNameEn: variant.colorNameEn,
      colorHex: variant.colorHex,
      size: variant.size,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      imageId: variant.imageId,
      isActive: variant.isActive,
      isDefault: variant.isDefault,
      sortOrder: variant.sortOrder,
      lowStockThreshold: variant.inventory?.lowStockThreshold ?? null,
      onHand: variant.inventory?.onHand ?? 0,
      reserved: variant.inventory?.reserved ?? 0,
    })),
    images: images.map((image) => ({
      id: image.id,
      url: image.url,
      altAr: image.altAr,
      altEn: image.altEn,
      width: image.width,
      height: image.height,
      sortOrder: image.sortOrder,
    })),
  }
}

/** Categories and brands for the product form. */
export async function getCatalogOptions() {
  const [categories, brands] = await Promise.all([
    prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
      select: { id: true, nameAr: true, nameEn: true, kind: true, parentId: true, isActive: true },
    }),
    prisma.brand.findMany({
      orderBy: { nameEn: 'asc' },
      select: { id: true, nameAr: true, nameEn: true, isActive: true },
    }),
  ])
  return { categories, brands }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function assertCatalogRefs(
  tx: DbClient,
  input: { categoryId: string; brandId: string | null },
) {
  const category = await tx.category.findUnique({
    where: { id: input.categoryId },
    select: { kind: true },
  })
  // Products belong to the category tree; collections (new arrivals, offers…) are rule-based.
  if (!category || category.kind !== 'STANDARD')
    throw new ValidationError({ categoryId: 'invalid' })
  if (input.brandId) {
    const brand = await tx.brand.findUnique({ where: { id: input.brandId }, select: { id: true } })
    if (!brand) throw new ValidationError({ brandId: 'invalid' })
  }
}

/** Recompute what the storefront derives from a product and its variants. */
export async function refreshDerived(tx: DbClient, productId: string): Promise<void> {
  const product = await tx.product.findUniqueOrThrow({
    where: { id: productId },
    include: {
      variants: {
        select: { sku: true, price: true, isActive: true, colorNameAr: true, colorNameEn: true },
      },
      brand: { select: { nameAr: true, nameEn: true } },
      category: {
        select: { nameAr: true, nameEn: true, parent: { select: { nameAr: true, nameEn: true } } },
      },
    },
  })
  const categories = [
    product.category,
    ...(product.category.parent ? [product.category.parent] : []),
  ]
  await tx.product.update({
    where: { id: productId },
    data: {
      ...priceRange(product.price, product.variants),
      searchText: productSearchDocument({
        nameAr: product.nameAr,
        nameEn: product.nameEn,
        sku: product.sku,
        variants: product.variants,
        brand: product.brand,
        categories,
        materialAr: product.materialAr,
        materialEn: product.materialEn,
      }),
    },
  })
}

/** A product can be published only when a shopper could actually buy it. */
async function assertPublishable(tx: DbClient, productId: string): Promise<void> {
  const [images, activeVariants] = await Promise.all([
    tx.productImage.count({ where: { productId } }),
    tx.productVariant.count({ where: { productId, isActive: true } }),
  ])
  if (images === 0)
    throw new ValidationError({ status: 'publishNeedsImage' }, 'Add an image before publishing')
  if (activeVariants === 0)
    throw new ValidationError(
      { status: 'publishNeedsVariant' },
      'Activate a variant before publishing',
    )
}

function productData(input: ProductInput) {
  const { status: _status, ...data } = input
  return data
}

export async function createProduct(
  input: ProductInput,
  firstVariant: { variant: VariantInput; initialStock: number },
  audit: AuditContext,
): Promise<{ id: string }> {
  if (input.status === 'PUBLISHED') {
    // A new product has no images yet: it starts as a draft and is published once complete.
    throw new ValidationError({ status: 'publishNeedsImage' }, 'Add an image before publishing')
  }
  try {
    return await prisma.$transaction(async (tx) => {
      await assertCatalogRefs(tx, input)
      const product = await tx.product.create({
        data: {
          ...productData(input),
          status: input.status,
          archivedAt: input.status === 'ARCHIVED' ? new Date() : null,
          minPrice: input.price,
          maxPrice: input.price,
        },
        select: { id: true, sku: true },
      })
      const { imageId: _imageId, lowStockThreshold, ...variant } = firstVariant.variant
      const created = await tx.productVariant.create({
        data: {
          ...variant,
          productId: product.id,
          isDefault: true,
          inventory: { create: { onHand: firstVariant.initialStock, lowStockThreshold } },
        },
        select: { id: true },
      })
      if (firstVariant.initialStock > 0) {
        await tx.inventoryTransaction.create({
          data: {
            variantId: created.id,
            type: 'INITIAL',
            quantityDelta: firstVariant.initialStock,
            previousOnHand: 0,
            newOnHand: firstVariant.initialStock,
            previousReserved: 0,
            newReserved: 0,
            reason: 'Initial stock',
            actorType: audit.actor.type,
            actorId: audit.actor.id,
          },
        })
      }
      await refreshDerived(tx, product.id)
      await recordAudit(tx, audit, {
        action: 'product.created',
        entityType: 'product',
        entityId: product.id,
        metadata: { sku: product.sku, initialStock: firstVariant.initialStock },
      })
      return { id: product.id }
    })
  } catch (error) {
    uniqueViolationToFieldError(error)
  }
}

export async function updateProduct(
  productId: string,
  input: ProductInput,
  audit: AuditContext,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.product.findUnique({ where: { id: productId } })
      if (!before) throw new ProductNotFoundError()
      await assertCatalogRefs(tx, input)
      if (input.status === 'PUBLISHED') await assertPublishable(tx, productId)
      const now = new Date()
      await tx.product.update({
        where: { id: productId },
        data: {
          ...productData(input),
          status: input.status,
          publishedAt:
            input.status === 'PUBLISHED' ? (before.publishedAt ?? now) : before.publishedAt,
          archivedAt: input.status === 'ARCHIVED' ? (before.archivedAt ?? now) : null,
        },
      })
      await refreshDerived(tx, productId)
      const { searchText: _a, minPrice: _b, maxPrice: _c, updatedAt: _d, ...comparable } = before
      await recordAudit(tx, audit, {
        action:
          before.status !== input.status
            ? `product.${input.status.toLowerCase()}`
            : 'product.updated',
        entityType: 'product',
        entityId: productId,
        metadata: { sku: input.sku, changes: diffFields(comparable, input) },
      })
    })
  } catch (error) {
    uniqueViolationToFieldError(error)
  }
}

/**
 * Permanently delete a product that was never ordered (drafts, mistakes).
 * Anything with order history is archived instead, so reports, returns and
 * reviews keep their reference.
 */
export async function deleteProduct(productId: string, audit: AuditContext): Promise<void> {
  const keys = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: {
        sku: true,
        _count: { select: { orderItems: true } },
        images: { select: { storageKey: true } },
      },
    })
    if (!product) throw new ProductNotFoundError()
    if (product._count.orderItems > 0) {
      throw new AppError('CONFLICT', 'Products with orders are archived, not deleted', {
        status: 409,
        details: { reason: 'HAS_ORDERS' },
      })
    }
    await tx.product.delete({ where: { id: productId } })
    await recordAudit(tx, audit, {
      action: 'product.deleted',
      entityType: 'product',
      entityId: productId,
      metadata: { sku: product.sku },
    })
    return product.images.flatMap((image) => (image.storageKey ? [image.storageKey] : []))
  })
  // Files go after the rows are gone; a failure leaves an orphaned file, never a broken page.
  for (const key of keys) {
    await getStorage()
      .delete(key)
      .catch((error: unknown) => logger.warn('storage.delete_failed', { key, error }))
  }
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

async function assertImageBelongs(tx: DbClient, productId: string, imageId: string | null) {
  if (!imageId) return
  const image = await tx.productImage.findFirst({
    where: { id: imageId, productId },
    select: { id: true },
  })
  if (!image) throw new ValidationError({ imageId: 'invalid' })
}

export async function addVariant(
  productId: string,
  input: { variant: VariantInput; initialStock: number },
  audit: AuditContext,
): Promise<{ id: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true },
      })
      if (!product) throw new ProductNotFoundError()
      await assertImageBelongs(tx, productId, input.variant.imageId)
      const { lowStockThreshold, ...variant } = input.variant
      if (variant.isDefault) {
        await tx.productVariant.updateMany({
          where: { productId, isDefault: true },
          data: { isDefault: false },
        })
      }
      const created = await tx.productVariant.create({
        data: {
          ...variant,
          productId,
          inventory: { create: { onHand: input.initialStock, lowStockThreshold } },
        },
        select: { id: true },
      })
      if (input.initialStock > 0) {
        await tx.inventoryTransaction.create({
          data: {
            variantId: created.id,
            type: 'INITIAL',
            quantityDelta: input.initialStock,
            previousOnHand: 0,
            newOnHand: input.initialStock,
            previousReserved: 0,
            newReserved: 0,
            reason: 'Initial stock',
            actorType: audit.actor.type,
            actorId: audit.actor.id,
          },
        })
      }
      await refreshDerived(tx, productId)
      await recordAudit(tx, audit, {
        action: 'variant.created',
        entityType: 'variant',
        entityId: created.id,
        metadata: { productId, sku: variant.sku, initialStock: input.initialStock },
      })
      return created
    })
  } catch (error) {
    uniqueViolationToFieldError(error)
  }
}

/**
 * Edit a variant. Stock is never edited here (that goes through inventory
 * adjustments with a reason); variants are deactivated rather than deleted
 * so order history keeps pointing at them.
 */
export async function updateVariant(
  variantId: string,
  input: VariantInput,
  audit: AuditContext,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.productVariant.findUnique({
        where: { id: variantId },
        include: {
          product: { select: { id: true, status: true } },
          inventory: { select: { lowStockThreshold: true } },
        },
      })
      if (!before) throw new NotFoundError('VARIANT_NOT_FOUND', 'Variant not found')
      const productId = before.product.id
      await assertImageBelongs(tx, productId, input.imageId)
      if (before.isActive && !input.isActive && before.product.status === 'PUBLISHED') {
        const others = await tx.productVariant.count({
          where: { productId, isActive: true, id: { not: variantId } },
        })
        if (others === 0)
          throw new ValidationError(
            { isActive: 'lastActiveVariant' },
            'A published product needs an active variant',
          )
      }
      const { lowStockThreshold, ...variant } = input
      if (variant.isDefault && !before.isDefault) {
        await tx.productVariant.updateMany({
          where: { productId, isDefault: true },
          data: { isDefault: false },
        })
      }
      await tx.productVariant.update({ where: { id: variantId }, data: variant })
      await tx.inventory.update({ where: { variantId }, data: { lowStockThreshold } })
      await refreshDerived(tx, productId)
      const { createdAt: _a, updatedAt: _b, product: _c, inventory, ...comparable } = before
      await recordAudit(tx, audit, {
        action: 'variant.updated',
        entityType: 'variant',
        entityId: variantId,
        metadata: {
          productId,
          sku: input.sku,
          changes: diffFields(
            { ...comparable, lowStockThreshold: inventory?.lowStockThreshold ?? null },
            input,
          ),
        },
      })
    })
  } catch (error) {
    uniqueViolationToFieldError(error)
  }
}
