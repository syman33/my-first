import { buildSearchDocument } from '@/utils/text'

/**
 * The denormalised search text stored on a product: both names, SKUs, brand,
 * category path, colours and materials — the words shoppers actually type.
 */
export function productSearchDocument(input: {
  nameAr: string
  nameEn: string
  sku: string
  variants: { sku: string; colorNameAr: string | null; colorNameEn: string | null }[]
  brand: { nameAr: string; nameEn: string } | null
  categories: { nameAr: string; nameEn: string }[]
  materialAr: string | null
  materialEn: string | null
}): string {
  return buildSearchDocument([
    input.nameAr,
    input.nameEn,
    input.sku,
    ...input.variants.flatMap((variant) => [variant.sku, variant.colorNameAr, variant.colorNameEn]),
    input.brand?.nameAr,
    input.brand?.nameEn,
    ...input.categories.flatMap((category) => [category.nameAr, category.nameEn]),
    input.materialAr,
    input.materialEn,
  ])
}

/** Effective price range over sellable variants (a variant price overrides the product price). */
export function priceRange(
  productPrice: number,
  variants: { price: number | null; isActive: boolean }[],
): { minPrice: number; maxPrice: number } {
  const prices = variants
    .filter((variant) => variant.isActive)
    .map((variant) => variant.price ?? productPrice)
  if (prices.length === 0) return { minPrice: productPrice, maxPrice: productPrice }
  return { minPrice: Math.min(...prices), maxPrice: Math.max(...prices) }
}
