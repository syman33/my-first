import { describe, expect, it } from 'vitest'
import { priceRange, productSearchDocument } from '@/lib/catalog/search-document'
import {
  categorySchema,
  inventoryAdjustmentSchema,
  productSchema,
  variantSchema,
} from '@/schemas/admin-catalog'

const category = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b'

const product = {
  nameAr: 'حقيبة جلدية',
  nameEn: 'Leather Tote',
  slugAr: 'حقيبة-جلدية',
  slugEn: 'Leather-Tote',
  sku: ' vlr-bag-001 ',
  descriptionAr: '',
  descriptionEn: '',
  price: 89_900,
  compareAtPrice: null,
  cost: null,
  categoryId: category,
  brandId: null,
  gender: 'WOMEN',
  materialAr: '',
  materialEn: null,
  careAr: null,
  careEn: null,
  lengthMm: null,
  widthMm: null,
  heightMm: null,
  weightGrams: null,
  isFeatured: false,
  isBestseller: false,
  isNewArrival: true,
  status: 'DRAFT',
  lowStockThreshold: 3,
  seoTitleAr: null,
  seoTitleEn: null,
  seoDescriptionAr: null,
  seoDescriptionEn: null,
}

describe('product schema', () => {
  it('normalises SKUs and slugs and turns blank optional text into null', () => {
    const parsed = productSchema.parse(product)
    expect(parsed.sku).toBe('VLR-BAG-001')
    expect(parsed.slugEn).toBe('leather-tote')
    expect(parsed.slugAr).toBe('حقيبة-جلدية')
    expect(parsed.materialAr).toBeNull()
  })

  it('requires a positive price and a compare-at price above it', () => {
    expect(productSchema.safeParse({ ...product, price: 0 }).success).toBe(false)
    expect(productSchema.safeParse({ ...product, price: 1.5 }).success).toBe(false)
    const compare = productSchema.safeParse({ ...product, compareAtPrice: 80_000 })
    expect(compare.success).toBe(false)
    expect(compare.error?.issues[0]?.path).toEqual(['compareAtPrice'])
    expect(productSchema.safeParse({ ...product, compareAtPrice: 99_900 }).success).toBe(true)
  })

  it('rejects malformed SKUs and slugs', () => {
    expect(productSchema.safeParse({ ...product, sku: 'has space' }).success).toBe(false)
    expect(productSchema.safeParse({ ...product, slugEn: 'no/slash' }).success).toBe(false)
    expect(productSchema.safeParse({ ...product, slugEn: '-leading' }).success).toBe(false)
  })
})

describe('variant schema', () => {
  const variant = {
    sku: 'VLR-BAG-001-BLK',
    barcode: '',
    nameAr: 'أسود',
    nameEn: 'Black',
    colorFamily: 'BLACK',
    colorNameAr: 'أسود',
    colorNameEn: 'Black',
    colorHex: '#171717',
    size: null,
    price: null,
    compareAtPrice: null,
    imageId: null,
    isActive: true,
    isDefault: true,
    sortOrder: 0,
    lowStockThreshold: null,
  }

  it('accepts an inheriting price and validates colour codes', () => {
    expect(variantSchema.parse(variant)).toMatchObject({ barcode: null, price: null })
    expect(variantSchema.safeParse({ ...variant, colorHex: 'black' }).success).toBe(false)
    expect(
      variantSchema.safeParse({ ...variant, price: 50_000, compareAtPrice: 40_000 }).success,
    ).toBe(false)
  })
})

describe('category schema', () => {
  const input = {
    slug: 'bags',
    nameAr: 'الحقائب',
    nameEn: 'Bags',
    descriptionAr: null,
    descriptionEn: null,
    imageUrl: '/images/categories/bags.webp',
    kind: 'STANDARD',
    gender: null,
    parentId: null,
    sortOrder: 1,
    isActive: true,
    showInNav: true,
    seoTitleAr: null,
    seoTitleEn: null,
    seoDescriptionAr: null,
    seoDescriptionEn: null,
  }

  it('refuses slugs that storefront routes already use', () => {
    for (const slug of ['cart', 'checkout', 'account', 'shop', 'payment', 'uploads']) {
      const result = categorySchema.safeParse({ ...input, slug })
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.message).toBe('slugReserved')
    }
    expect(categorySchema.safeParse(input).success).toBe(true)
  })

  it('accepts only same-origin paths or https image URLs', () => {
    expect(categorySchema.safeParse({ ...input, imageUrl: 'javascript:alert(1)' }).success).toBe(
      false,
    )
    expect(categorySchema.safeParse({ ...input, imageUrl: '//evil.example/x.png' }).success).toBe(
      false,
    )
    expect(
      categorySchema.safeParse({ ...input, imageUrl: 'http://insecure.example/x.png' }).success,
    ).toBe(false)
    expect(
      categorySchema.safeParse({ ...input, imageUrl: 'https://cdn.example/x.png' }).success,
    ).toBe(true)
  })
})

describe('inventory adjustments', () => {
  it('distinguishes receiving, writing off and counting', () => {
    expect(
      inventoryAdjustmentSchema.parse({ type: 'RESTOCK', quantity: 5, reason: 'PO-1042' }),
    ).toMatchObject({ quantity: 5 })
    expect(
      inventoryAdjustmentSchema.safeParse({ type: 'RESTOCK', quantity: 0, reason: 'none' }).success,
    ).toBe(false)
    expect(
      inventoryAdjustmentSchema.safeParse({ type: 'COUNT', counted: 0, reason: 'Annual count' })
        .success,
    ).toBe(true)
    expect(
      inventoryAdjustmentSchema.safeParse({ type: 'COUNT', counted: -1, reason: 'Annual count' })
        .success,
    ).toBe(false)
    expect(
      inventoryAdjustmentSchema.safeParse({ type: 'RESTOCK', quantity: 2, reason: '' }).success,
    ).toBe(false)
  })
})

describe('derived product fields', () => {
  it('computes the price range over active variants only', () => {
    expect(priceRange(50_000, [])).toEqual({ minPrice: 50_000, maxPrice: 50_000 })
    expect(
      priceRange(50_000, [
        { price: null, isActive: true },
        { price: 65_000, isActive: true },
        { price: 10_000, isActive: false },
      ]),
    ).toEqual({ minPrice: 50_000, maxPrice: 65_000 })
  })

  it('builds a normalised bilingual search document', () => {
    const document = productSearchDocument({
      nameAr: 'ساعة أنيقة',
      nameEn: 'Élan Watch',
      sku: 'VLR-W-01',
      variants: [{ sku: 'VLR-W-01-GLD', colorNameAr: 'ذهبي', colorNameEn: 'Gold' }],
      brand: { nameAr: 'فيلورا', nameEn: 'VÉLORA' },
      categories: [{ nameAr: 'ساعات', nameEn: 'Watches' }],
      materialAr: null,
      materialEn: 'Stainless steel',
    })
    for (const token of [
      'ساعه',
      'انيقه',
      'elan',
      'watch',
      'gold',
      'ذهبي',
      'velora',
      'watches',
      'stainless',
    ]) {
      expect(document.split(' ')).toContain(token)
    }
  })
})
