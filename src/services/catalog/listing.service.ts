import 'server-only'
import { prisma } from '@/db/client'
import type { Prisma } from '@/generated/prisma/client'
import type { Locale } from '@/i18n/config'
import { COLOR_FAMILIES, type ListingFilters, PAGE_SIZE, type SortOption } from '@/schemas/catalog'
import { categoryIdsForSlugs, getActiveCategories } from './category.service'
import { toProductCard, type ProductCardData } from '@/lib/catalog/presentation'
import type { ListingFacets, ListingPage } from '@/types/catalog'
import { searchTermGroups } from './search-terms'

/**
 * Product listings for category, collection, shop and search pages. All
 * filtering, sorting and pagination happens in PostgreSQL; only one page
 * of cards is ever loaded.
 */

export type ListingScope =
  | { kind: 'all' }
  | { kind: 'category'; categoryIds: string[] }
  | { kind: 'gender'; gender: 'WOMEN' | 'MEN' }
  | { kind: 'new-arrivals' }
  | { kind: 'best-sellers' }
  | { kind: 'offers' }

/** What shoppers may see: published, live and in an active category. */
export function visibleProductWhere(now: Date): Prisma.ProductWhereInput {
  return { status: 'PUBLISHED', publishedAt: { lte: now }, category: { isActive: true } }
}

/**
 * On sale: the displayed compare-at price is above the selling price, either
 * at product level (for variants that inherit the price) or on a variant
 * with its own price. Mirrors `effectivePrice`.
 */
function onSaleWhere(): Prisma.ProductWhereInput {
  return {
    OR: [
      {
        compareAtPrice: { gt: prisma.product.fields.price },
        variants: { some: { isActive: true, price: null } },
      },
      {
        variants: {
          some: {
            isActive: true,
            price: { not: null },
            compareAtPrice: { gt: prisma.productVariant.fields.price },
          },
        },
      },
    ],
  }
}

export function scopeWhere(scope: ListingScope): Prisma.ProductWhereInput {
  switch (scope.kind) {
    case 'all':
      return {}
    case 'category':
      return { categoryId: { in: scope.categoryIds } }
    case 'gender':
      // Unisex pieces belong in both the women's and the men's edit.
      return { gender: { in: [scope.gender, 'UNISEX'] } }
    case 'new-arrivals':
      return { isNewArrival: true }
    case 'best-sellers':
      return { isBestseller: true }
    case 'offers':
      return onSaleWhere()
  }
}

function searchWhere(query: string): Prisma.ProductWhereInput[] {
  return searchTermGroups(query).map((alternatives) => ({
    OR: alternatives.map((term) => ({ searchText: { contains: term } })),
  }))
}

/**
 * Filters that narrow a scope. Colour and availability share one variant
 * condition so "black, in stock" means a black variant that is in stock.
 */
export function buildListingWhere(
  scope: ListingScope,
  filters: ListingFilters,
  categoryIds: string[] | null,
  now: Date,
): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [visibleProductWhere(now), scopeWhere(scope)]
  if (filters.q) and.push(...searchWhere(filters.q))
  if (categoryIds) and.push({ categoryId: { in: categoryIds } })
  if (filters.genders.length > 0) and.push({ gender: { in: filters.genders } })
  if (filters.brands.length > 0)
    and.push({ brand: { slug: { in: filters.brands }, isActive: true } })
  if (filters.minPrice !== null || filters.maxPrice !== null) {
    and.push({
      minPrice: {
        ...(filters.minPrice !== null ? { gte: filters.minPrice } : {}),
        ...(filters.maxPrice !== null ? { lte: filters.maxPrice } : {}),
      },
    })
  }
  if (filters.colors.length > 0 || filters.inStock) {
    and.push({
      variants: {
        some: {
          isActive: true,
          ...(filters.colors.length > 0 ? { colorFamily: { in: filters.colors } } : {}),
          ...(filters.inStock
            ? { inventory: { onHand: { gt: prisma.inventory.fields.reserved } } }
            : {}),
        },
      },
    })
  }
  if (filters.onSale) and.push(onSaleWhere())
  return { AND: and }
}

/** Stable orderings: every sort ends with a unique tie-breaker so pages never overlap. */
export function listingOrderBy(sort: SortOption): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'featured':
      return [
        { isFeatured: 'desc' },
        { salesCount: 'desc' },
        { publishedAt: { sort: 'desc', nulls: 'last' } },
        { id: 'asc' },
      ]
    case 'newest':
      return [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }]
    case 'best-selling':
      return [
        { salesCount: 'desc' },
        { publishedAt: { sort: 'desc', nulls: 'last' } },
        { id: 'asc' },
      ]
    case 'price-asc':
      return [{ minPrice: 'asc' }, { id: 'asc' }]
    case 'price-desc':
      return [{ minPrice: 'desc' }, { id: 'asc' }]
    case 'rating':
      return [{ ratingAverage: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }]
  }
}

export const productCardSelect = {
  id: true,
  slugAr: true,
  slugEn: true,
  nameAr: true,
  nameEn: true,
  price: true,
  compareAtPrice: true,
  isNewArrival: true,
  isBestseller: true,
  lowStockThreshold: true,
  ratingAverage: true,
  ratingCount: true,
  category: { select: { slug: true, nameAr: true, nameEn: true } },
  brand: { select: { nameAr: true, nameEn: true } },
  images: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    take: 2,
    select: { url: true, altAr: true, altEn: true },
  },
  variants: {
    where: { isActive: true },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
    select: {
      id: true,
      isDefault: true,
      price: true,
      compareAtPrice: true,
      colorHex: true,
      colorNameAr: true,
      colorNameEn: true,
      inventory: { select: { onHand: true, reserved: true, lowStockThreshold: true } },
    },
  },
} satisfies Prisma.ProductSelect

export async function listProducts(
  scope: ListingScope,
  filters: ListingFilters,
  locale: Locale,
  now: Date = new Date(),
): Promise<ListingPage> {
  const categories = await getActiveCategories()
  const categoryIds =
    filters.categories.length > 0 ? categoryIdsForSlugs(categories, filters.categories) : null
  const where = buildListingWhere(scope, filters, categoryIds, now)
  const [total, rows] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: listingOrderBy(filters.sort),
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: productCardSelect,
    }),
  ])
  return {
    items: rows.map((row) => toProductCard(row, locale)),
    total,
    page: filters.page,
    pageCount: Math.max(Math.ceil(total / PAGE_SIZE), 1),
    pageSize: PAGE_SIZE,
  }
}

/**
 * Filter options for a scope (and search query). Options are computed from
 * the unfiltered scope so choosing one filter never hides the others.
 */
export async function getListingFacets(
  scope: ListingScope,
  query: string,
  now: Date = new Date(),
): Promise<ListingFacets> {
  const base: Prisma.ProductWhereInput = {
    AND: [visibleProductWhere(now), scopeWhere(scope), ...(query ? searchWhere(query) : [])],
  }
  const [colorRows, brands, genderRows, categoryRows, prices, categories] = await Promise.all([
    prisma.productVariant.findMany({
      where: { isActive: true, colorFamily: { not: null }, product: base },
      distinct: ['colorFamily'],
      select: { colorFamily: true },
    }),
    prisma.brand.findMany({
      where: { isActive: true, products: { some: base } },
      orderBy: { nameEn: 'asc' },
      select: { slug: true, nameAr: true, nameEn: true },
    }),
    prisma.product.findMany({ where: base, distinct: ['gender'], select: { gender: true } }),
    prisma.product.findMany({
      where: base,
      distinct: ['categoryId'],
      select: { categoryId: true },
    }),
    prisma.product.aggregate({ where: base, _min: { minPrice: true }, _max: { minPrice: true } }),
    getActiveCategories(),
  ])

  // Offer top-level categories that contain at least one matching product.
  const present = new Set(categoryRows.map((row) => row.categoryId))
  const topLevel = categories.filter((c) => c.kind === 'STANDARD' && c.parentId === null)
  const withProducts = topLevel.filter((top) =>
    categoryIdsForSlugs(categories, [top.slug]).some((id) => present.has(id)),
  )

  // Present colours in the schema's (merchandising) order.
  const colors = colorRows
    .flatMap((row) => (row.colorFamily ? [row.colorFamily] : []))
    .sort((a, b) => COLOR_FAMILIES.indexOf(a) - COLOR_FAMILIES.indexOf(b))

  const min = prices._min.minPrice
  const max = prices._max.minPrice
  return {
    colors,
    brands,
    genders: (['WOMEN', 'MEN', 'UNISEX'] as const).filter((g) =>
      genderRows.some((r) => r.gender === g),
    ),
    categories: withProducts.map(({ slug, nameAr, nameEn }) => ({ slug, nameAr, nameEn })),
    priceRange: min !== null && max !== null ? { min, max } : null,
  }
}

/** A short rail of cards (homepage sections, related products). */
export async function productRail(
  scope: ListingScope,
  sort: SortOption,
  locale: Locale,
  options: { take?: number; excludeId?: string; now?: Date } = {},
): Promise<ProductCardData[]> {
  const now = options.now ?? new Date()
  const rows = await prisma.product.findMany({
    where: {
      AND: [
        visibleProductWhere(now),
        scopeWhere(scope),
        ...(options.excludeId ? [{ id: { not: options.excludeId } }] : []),
      ],
    },
    orderBy: listingOrderBy(sort),
    take: options.take ?? 8,
    select: productCardSelect,
  })
  return rows.map((row) => toProductCard(row, locale))
}
