import type { Locale } from '@/i18n/config'
import { discountPercent, type Halalas } from '@/utils/money'

/**
 * Pure presentation rules for products: effective prices, discounts, stock
 * levels and badges. Shared by listing cards and the product page so the
 * same product never shows two different prices.
 */

export interface PricedVariant {
  price: Halalas | null
  compareAtPrice: Halalas | null
}

export interface PricedProduct {
  price: Halalas
  compareAtPrice: Halalas | null
}

/**
 * A variant's selling price falls back to the product price. Its compare-at
 * price only applies together with its own price; otherwise the product's
 * compare-at applies. A compare-at that is not above the price is ignored.
 */
export function effectivePrice(
  product: PricedProduct,
  variant: PricedVariant | null,
): { price: Halalas; compareAtPrice: Halalas | null } {
  const ownPrice = variant?.price ?? null
  const price = ownPrice ?? product.price
  const compareAt = ownPrice !== null ? (variant?.compareAtPrice ?? null) : product.compareAtPrice
  return { price, compareAtPrice: compareAt !== null && compareAt > price ? compareAt : null }
}

export type StockLevel = 'in_stock' | 'low_stock' | 'out_of_stock'

export interface StockRecord {
  onHand: number
  reserved: number
  lowStockThreshold: number | null
}

/** Units that can still be sold (reserved units belong to pending orders). */
export function availableUnits(inventory: StockRecord | null): number {
  if (!inventory) return 0
  return Math.max(inventory.onHand - inventory.reserved, 0)
}

export function stockLevel(available: number, threshold: number): StockLevel {
  if (available <= 0) return 'out_of_stock'
  return available <= threshold ? 'low_stock' : 'in_stock'
}

export type ProductBadge =
  | { kind: 'sold_out' }
  | { kind: 'sale'; percent: number }
  | { kind: 'new' }
  | { kind: 'bestseller' }

export interface CardSource {
  id: string
  slugAr: string
  slugEn: string
  nameAr: string
  nameEn: string
  price: Halalas
  compareAtPrice: Halalas | null
  isNewArrival: boolean
  isBestseller: boolean
  lowStockThreshold: number
  ratingAverage: number
  ratingCount: number
  category: { slug: string; nameAr: string; nameEn: string }
  brand: { nameAr: string; nameEn: string } | null
  images: { url: string; altAr: string | null; altEn: string | null }[]
  variants: (PricedVariant & {
    id: string
    isDefault: boolean
    colorHex: string | null
    colorNameAr: string | null
    colorNameEn: string | null
    inventory: StockRecord | null
  })[]
}

export interface ProductCardData {
  id: string
  slug: string
  href: string
  name: string
  categoryName: string
  brandName: string | null
  image: { url: string; alt: string } | null
  hoverImage: { url: string; alt: string } | null
  price: Halalas
  compareAtPrice: Halalas | null
  /** Variants are priced differently: show "from {price}". */
  priceFrom: boolean
  discountPercent: number
  stock: StockLevel
  badge: ProductBadge | null
  rating: { average: number; count: number } | null
  swatches: { hex: string; name: string }[]
  /** The variant a quick "add to bag" would use, when it is unambiguous and available. */
  quickAddVariantId: string | null
}

export function productHref(locale: Locale, product: { slugAr: string; slugEn: string }): string {
  return `/${locale}/product/${encodeURIComponent(locale === 'ar' ? product.slugAr : product.slugEn)}`
}

export function toProductCard(source: CardSource, locale: Locale): ProductCardData {
  const ar = locale === 'ar'
  const priced = source.variants.map((variant) => ({
    variant,
    ...effectivePrice(source, variant),
    available: availableUnits(variant.inventory),
  }))
  // Lead with the lowest price; among equal prices prefer the default variant.
  const lead =
    [...priced].sort(
      (a, b) => a.price - b.price || Number(b.variant.isDefault) - Number(a.variant.isDefault),
    )[0] ?? null
  const price = lead?.price ?? source.price
  const compareAtPrice = lead ? lead.compareAtPrice : effectivePrice(source, null).compareAtPrice
  const totalAvailable = priced.reduce((sum, entry) => sum + entry.available, 0)
  const stock = stockLevel(totalAvailable, source.lowStockThreshold)
  const percent = discountPercent(price, compareAtPrice)

  let badge: ProductBadge | null = null
  if (stock === 'out_of_stock') badge = { kind: 'sold_out' }
  else if (percent > 0) badge = { kind: 'sale', percent }
  else if (source.isNewArrival) badge = { kind: 'new' }
  else if (source.isBestseller) badge = { kind: 'bestseller' }

  const swatches = new Map<string, string>()
  for (const { variant } of priced) {
    if (variant.colorHex && !swatches.has(variant.colorHex)) {
      swatches.set(variant.colorHex, (ar ? variant.colorNameAr : variant.colorNameEn) ?? '')
    }
  }

  const image = (index: number) => {
    const img = source.images[index]
    if (!img) return null
    return {
      url: img.url,
      alt: (ar ? img.altAr : img.altEn) ?? (ar ? source.nameAr : source.nameEn),
    }
  }

  const sellable = priced.filter((entry) => entry.available > 0)
  return {
    id: source.id,
    slug: ar ? source.slugAr : source.slugEn,
    href: productHref(locale, source),
    name: ar ? source.nameAr : source.nameEn,
    categoryName: ar ? source.category.nameAr : source.category.nameEn,
    brandName: source.brand ? (ar ? source.brand.nameAr : source.brand.nameEn) : null,
    image: image(0),
    hoverImage: image(1),
    price,
    compareAtPrice,
    priceFrom: new Set(priced.map((entry) => entry.price)).size > 1,
    discountPercent: percent,
    stock,
    badge,
    rating:
      source.ratingCount > 0
        ? { average: source.ratingAverage / 100, count: source.ratingCount }
        : null,
    swatches: [...swatches].map(([hex, name]) => ({ hex, name })),
    quickAddVariantId:
      priced.length === 1 && sellable.length === 1 ? sellable[0]!.variant.id : null,
  }
}
