import 'server-only'
import { cache } from 'react'
import { prisma } from '@/db/client'
import type { ColorFamily, Gender } from '@/generated/prisma/enums'
import type { Locale } from '@/i18n/config'
import type { Halalas } from '@/utils/money'
import { decodeSlugParam } from '@/utils/text'
import type { ReviewSummary } from '@/types/catalog'
import { categoryAncestry, getActiveCategories } from './category.service'
import { visibleProductWhere } from './listing.service'
import {
  availableUnits,
  effectivePrice,
  type StockLevel,
  stockLevel,
} from '@/lib/catalog/presentation'

export interface ProductVariantView {
  id: string
  sku: string
  name: string
  colorFamily: ColorFamily | null
  colorName: string | null
  colorHex: string | null
  size: string | null
  price: Halalas
  compareAtPrice: Halalas | null
  stock: StockLevel
  /** Only exposed when stock is low ("only 2 left"); exact counts are not shown otherwise. */
  lowStockCount: number | null
  imageId: string | null
  isDefault: boolean
}

export interface ProductDetail {
  id: string
  sku: string
  slugAr: string
  slugEn: string
  name: string
  description: string
  material: string | null
  care: string | null
  dimensionsMm: { length: number | null; width: number | null; height: number | null } | null
  weightGrams: number | null
  gender: Gender
  brand: { slug: string; name: string } | null
  breadcrumbs: { slug: string; name: string }[]
  categoryId: string
  images: { id: string; url: string; alt: string; width: number | null; height: number | null }[]
  variants: ProductVariantView[]
  defaultVariantId: string | null
  rating: { average: number; count: number } | null
  isNewArrival: boolean
  isBestseller: boolean
  seoTitle: string | null
  seoDescription: string | null
  updatedAt: Date
}

export type ProductLookup =
  | { status: 'ok'; product: ProductDetail }
  | { status: 'redirect'; slug: string }
  | { status: 'not_found' }

const loadProduct = cache(async (slug: string) =>
  prisma.product.findFirst({
    where: { AND: [visibleProductWhere(new Date()), { OR: [{ slugAr: slug }, { slugEn: slug }] }] },
    select: {
      id: true,
      sku: true,
      slugAr: true,
      slugEn: true,
      nameAr: true,
      nameEn: true,
      descriptionAr: true,
      descriptionEn: true,
      materialAr: true,
      materialEn: true,
      careAr: true,
      careEn: true,
      lengthMm: true,
      widthMm: true,
      heightMm: true,
      weightGrams: true,
      gender: true,
      price: true,
      compareAtPrice: true,
      lowStockThreshold: true,
      isNewArrival: true,
      isBestseller: true,
      ratingAverage: true,
      ratingCount: true,
      seoTitleAr: true,
      seoTitleEn: true,
      seoDescriptionAr: true,
      seoDescriptionEn: true,
      categoryId: true,
      updatedAt: true,
      brand: { select: { slug: true, nameAr: true, nameEn: true, isActive: true } },
      images: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, url: true, altAr: true, altEn: true, width: true, height: true },
      },
      variants: {
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          sku: true,
          nameAr: true,
          nameEn: true,
          colorFamily: true,
          colorNameAr: true,
          colorNameEn: true,
          colorHex: true,
          size: true,
          price: true,
          compareAtPrice: true,
          imageId: true,
          isDefault: true,
          inventory: { select: { onHand: true, reserved: true, lowStockThreshold: true } },
        },
      },
    },
  }),
)

/**
 * Resolve a product page. Either language's slug finds the product; a slug
 * from the other language redirects to this language's canonical URL.
 */
export async function getProductPage(rawSlug: string, locale: Locale): Promise<ProductLookup> {
  const slug = decodeSlugParam(rawSlug)
  if (!slug) return { status: 'not_found' }
  const row = await loadProduct(slug)
  if (!row) return { status: 'not_found' }
  const canonical = locale === 'ar' ? row.slugAr : row.slugEn
  if (canonical !== slug) return { status: 'redirect', slug: canonical }

  const ar = locale === 'ar'
  const categories = await getActiveCategories()
  const variants: ProductVariantView[] = row.variants.map((variant) => {
    const { price, compareAtPrice } = effectivePrice(row, variant)
    const available = availableUnits(variant.inventory)
    const threshold = variant.inventory?.lowStockThreshold ?? row.lowStockThreshold
    const level = stockLevel(available, threshold)
    return {
      id: variant.id,
      sku: variant.sku,
      name: ar ? variant.nameAr : variant.nameEn,
      colorFamily: variant.colorFamily,
      colorName: ar ? variant.colorNameAr : variant.colorNameEn,
      colorHex: variant.colorHex,
      size: variant.size,
      price,
      compareAtPrice,
      stock: level,
      lowStockCount: level === 'low_stock' ? available : null,
      imageId: variant.imageId,
      isDefault: variant.isDefault,
    }
  })
  const defaultVariant =
    variants.find((v) => v.isDefault && v.stock !== 'out_of_stock') ??
    variants.find((v) => v.stock !== 'out_of_stock') ??
    variants[0] ??
    null

  const hasDimensions = row.lengthMm !== null || row.widthMm !== null || row.heightMm !== null
  return {
    status: 'ok',
    product: {
      id: row.id,
      sku: row.sku,
      slugAr: row.slugAr,
      slugEn: row.slugEn,
      name: ar ? row.nameAr : row.nameEn,
      description: ar ? row.descriptionAr : row.descriptionEn,
      material: ar ? row.materialAr : row.materialEn,
      care: ar ? row.careAr : row.careEn,
      dimensionsMm: hasDimensions
        ? { length: row.lengthMm, width: row.widthMm, height: row.heightMm }
        : null,
      weightGrams: row.weightGrams,
      gender: row.gender,
      brand:
        row.brand && row.brand.isActive
          ? { slug: row.brand.slug, name: ar ? row.brand.nameAr : row.brand.nameEn }
          : null,
      breadcrumbs: categoryAncestry(categories, row.categoryId).map((c) => ({
        slug: c.slug,
        name: ar ? c.nameAr : c.nameEn,
      })),
      categoryId: row.categoryId,
      images: row.images.map((image) => ({
        id: image.id,
        url: image.url,
        alt: (ar ? image.altAr : image.altEn) ?? (ar ? row.nameAr : row.nameEn),
        width: image.width,
        height: image.height,
      })),
      variants,
      defaultVariantId: defaultVariant?.id ?? null,
      rating:
        row.ratingCount > 0 ? { average: row.ratingAverage / 100, count: row.ratingCount } : null,
      isNewArrival: row.isNewArrival,
      isBestseller: row.isBestseller,
      seoTitle: ar ? row.seoTitleAr : row.seoTitleEn,
      seoDescription: ar ? row.seoDescriptionAr : row.seoDescriptionEn,
      updatedAt: row.updatedAt,
    },
  }
}

export const REVIEWS_PAGE_SIZE = 10

export async function getApprovedReviews(productId: string, page = 1): Promise<ReviewSummary> {
  const where = { productId, status: 'APPROVED' as const }
  const [rows, total, groups] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * REVIEWS_PAGE_SIZE,
      take: REVIEWS_PAGE_SIZE,
      select: {
        id: true,
        rating: true,
        title: true,
        body: true,
        isVerifiedPurchase: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
    prisma.review.count({ where }),
    prisma.review.groupBy({ by: ['rating'], where, _count: { _all: true } }),
  ])
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const group of groups) {
    if (group.rating >= 1 && group.rating <= 5) {
      distribution[group.rating as 1 | 2 | 3 | 4 | 5] = group._count._all
    }
  }
  return {
    pageCount: Math.ceil(total / REVIEWS_PAGE_SIZE),
    items: rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      title: row.title,
      body: row.body,
      author: row.user.name.trim().split(/\s+/)[0] ?? '',
      verified: row.isVerifiedPurchase,
      createdAt: row.createdAt,
    })),
    total,
    distribution,
  }
}
