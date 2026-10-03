import { ColorFamily, type Gender } from '@/generated/prisma/enums'
import { normalizeNumericInput } from '@/utils/money'

/**
 * Product listing query parameters (category, shop and search pages).
 *
 * Parsing is deliberately lenient: these values come from shareable URLs,
 * so unknown or malformed values are dropped instead of failing the page.
 * Prices travel in whole riyals in the URL and are converted to halalas.
 */

export const SORT_OPTIONS = [
  'featured',
  'newest',
  'best-selling',
  'price-asc',
  'price-desc',
  'rating',
] as const
export type SortOption = (typeof SORT_OPTIONS)[number]

export const PAGE_SIZE = 24
/** Deep pagination is expensive and never useful to shoppers; clamp it. */
export const MAX_PAGE = 200
export const MAX_QUERY_LENGTH = 100

const GENDER_PARAMS: Record<string, Gender> = { women: 'WOMEN', men: 'MEN', unisex: 'UNISEX' }
export const COLOR_FAMILIES = Object.values(ColorFamily)
const SLUG_PARAM = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u

export interface ListingFilters {
  q: string
  sort: SortOption
  page: number
  genders: Gender[]
  colors: ColorFamily[]
  brands: string[]
  categories: string[]
  /** Halalas, inclusive. */
  minPrice: number | null
  /** Halalas, inclusive. */
  maxPrice: number | null
  inStock: boolean
  onSale: boolean
}

export type RawSearchParams = Record<string, string | string[] | undefined>

/** All values for a key, accepting both `?color=a&color=b` and `?color=a,b`. */
function values(params: RawSearchParams, key: string): string[] {
  const raw = params[key]
  const list = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]
  return list
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
}

function first(params: RawSearchParams, key: string): string | undefined {
  return values(params, key)[0]
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

/** Whole riyals → halalas; anything else (negative, fractional, absurd) is ignored. */
function parsePrice(value: string | undefined): number | null {
  if (!value) return null
  const normalized = normalizeNumericInput(value)
  if (!/^\d{1,7}$/.test(normalized)) return null
  return Number(normalized) * 100
}

function parsePage(value: string | undefined): number {
  const normalized = value ? normalizeNumericInput(value) : ''
  if (!/^\d{1,6}$/.test(normalized)) return 1
  return Math.min(Math.max(Number(normalized), 1), MAX_PAGE)
}

function isTruthyFlag(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'on'
}

export function parseListingParams(
  params: RawSearchParams,
  defaults: { sort: SortOption },
): ListingFilters {
  const sortParam = first(params, 'sort')
  const sort = SORT_OPTIONS.find((option) => option === sortParam) ?? defaults.sort
  let minPrice = parsePrice(first(params, 'min'))
  let maxPrice = parsePrice(first(params, 'max'))
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    ;[minPrice, maxPrice] = [maxPrice, minPrice]
  }
  return {
    q: (first(params, 'q') ?? '').slice(0, MAX_QUERY_LENGTH).trim(),
    sort,
    page: parsePage(first(params, 'page')),
    genders: unique(
      values(params, 'gender').flatMap((g) => {
        const gender = GENDER_PARAMS[g.toLowerCase()]
        return gender ? [gender] : []
      }),
    ),
    colors: unique(
      values(params, 'color').flatMap((c) => {
        const color = COLOR_FAMILIES.find((family) => family === c.toUpperCase().replace(/-/g, '_'))
        return color ? [color] : []
      }),
    ),
    brands: unique(values(params, 'brand').filter((slug) => SLUG_PARAM.test(slug))).slice(0, 20),
    categories: unique(values(params, 'category').filter((slug) => SLUG_PARAM.test(slug))).slice(
      0,
      20,
    ),
    minPrice,
    maxPrice,
    inStock: isTruthyFlag(first(params, 'instock')),
    onSale: isTruthyFlag(first(params, 'sale')),
  }
}

/** Number of active narrowing filters (for the "Filters (3)" button). */
export function activeFilterCount(filters: ListingFilters): number {
  return (
    filters.genders.length +
    filters.colors.length +
    filters.brands.length +
    filters.categories.length +
    (filters.minPrice !== null || filters.maxPrice !== null ? 1 : 0) +
    (filters.inStock ? 1 : 0) +
    (filters.onSale ? 1 : 0)
  )
}

/**
 * Serialise filters back to a query string (used for pagination, sort and
 * "remove filter" links). Default values are omitted to keep URLs canonical.
 */
export function listingQueryString(
  filters: ListingFilters,
  defaults: { sort: SortOption },
  overrides: Partial<ListingFilters> = {},
): string {
  const f = { ...filters, ...overrides }
  const params = new URLSearchParams()
  if (f.q) params.set('q', f.q)
  for (const slug of f.categories) params.append('category', slug)
  for (const gender of f.genders) params.append('gender', gender.toLowerCase())
  for (const color of f.colors) params.append('color', color.toLowerCase())
  for (const slug of f.brands) params.append('brand', slug)
  if (f.minPrice !== null) params.set('min', String(Math.floor(f.minPrice / 100)))
  if (f.maxPrice !== null) params.set('max', String(Math.floor(f.maxPrice / 100)))
  if (f.inStock) params.set('instock', '1')
  if (f.onSale) params.set('sale', '1')
  if (f.sort !== defaults.sort) params.set('sort', f.sort)
  if (f.page > 1) params.set('page', String(f.page))
  const query = params.toString()
  return query ? `?${query}` : ''
}
