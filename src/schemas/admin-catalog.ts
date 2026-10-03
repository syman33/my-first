import { z } from 'zod'
import { CategoryKind, ColorFamily, Gender } from '@/generated/prisma/enums'
import { RESERVED_CATEGORY_SLUGS } from '@/lib/catalog/reserved-slugs'
import { isValidSlug } from '@/utils/text'
import { uuidField } from './common'

/**
 * Catalogue validation shared by the admin forms and the admin API.
 * Money is integer halalas (forms convert SAR input before sending).
 */

const text = (min: number, max: number) =>
  z
    .string({ error: 'required' })
    .trim()
    .min(min, { error: min <= 1 ? 'required' : 'tooShort' })
    .max(max, { error: 'tooLong' })

/** Optional text: blank → null (the database columns are nullable). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: 'tooLong' })
    .nullish()
    .transform((value) => value || null)

const halalas = z
  .number({ error: 'amount' })
  .int({ error: 'amount' })
  .min(0, { error: 'amount' })
  .max(100_000_000, { error: 'amount' })

const slugField = z
  .string({ error: 'required' })
  .trim()
  .toLowerCase()
  .min(1, { error: 'required' })
  .max(180, { error: 'tooLong' })
  .refine(isValidSlug, { error: 'slug' })

export const skuField = z
  .string({ error: 'required' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{1,63}$/, { error: 'sku' })

const positiveMeasure = (max: number) => z.number().int().min(1).max(max).nullable()

/** Same-origin path (e.g. /images/...) or an https URL. */
const imageUrlField = z
  .string()
  .trim()
  .max(500, { error: 'tooLong' })
  .refine(
    (value) =>
      value === '' || /^\/(?!\/)[\w\-./]+$/.test(value) || /^https:\/\/[^\s]+$/.test(value),
    { error: 'url' },
  )
  .nullish()
  .transform((value) => value || null)

export const productSchema = z
  .object({
    nameAr: text(2, 200),
    nameEn: text(2, 200),
    slugAr: slugField,
    slugEn: slugField,
    sku: skuField,
    descriptionAr: z.string().trim().max(5000, { error: 'tooLong' }).default(''),
    descriptionEn: z.string().trim().max(5000, { error: 'tooLong' }).default(''),
    price: halalas.refine((value) => value > 0, { error: 'amount' }),
    compareAtPrice: halalas.nullable(),
    cost: halalas.nullable(),
    categoryId: uuidField,
    brandId: uuidField.nullable(),
    gender: z.enum(Gender),
    materialAr: optionalText(200),
    materialEn: optionalText(200),
    careAr: optionalText(2000),
    careEn: optionalText(2000),
    lengthMm: positiveMeasure(100_000),
    widthMm: positiveMeasure(100_000),
    heightMm: positiveMeasure(100_000),
    weightGrams: positiveMeasure(1_000_000),
    isFeatured: z.boolean(),
    isBestseller: z.boolean(),
    isNewArrival: z.boolean(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
    lowStockThreshold: z.number().int().min(0).max(1000),
    seoTitleAr: optionalText(160),
    seoTitleEn: optionalText(160),
    seoDescriptionAr: optionalText(320),
    seoDescriptionEn: optionalText(320),
  })
  .refine((value) => value.compareAtPrice === null || value.compareAtPrice > value.price, {
    path: ['compareAtPrice'],
    error: 'compareAtPrice',
  })
export type ProductInput = z.output<typeof productSchema>

export const variantSchema = z
  .object({
    sku: skuField,
    barcode: z
      .string()
      .trim()
      .regex(/^[0-9A-Za-z-]{4,64}$/, { error: 'invalid' })
      .nullish()
      .or(z.literal(''))
      .transform((value) => value || null),
    nameAr: text(1, 160),
    nameEn: text(1, 160),
    colorFamily: z.enum(ColorFamily).nullable(),
    colorNameAr: optionalText(80),
    colorNameEn: optionalText(80),
    colorHex: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/, { error: 'invalid' })
      .nullish()
      .or(z.literal(''))
      .transform((value) => value || null),
    size: optionalText(40),
    price: halalas.refine((value) => value > 0, { error: 'amount' }).nullable(),
    compareAtPrice: halalas.nullable(),
    imageId: uuidField.nullable(),
    isActive: z.boolean(),
    isDefault: z.boolean(),
    sortOrder: z.number().int().min(0).max(1000),
    lowStockThreshold: z.number().int().min(0).max(1000).nullable(),
  })
  .refine(
    (value) =>
      value.compareAtPrice === null || value.price === null || value.compareAtPrice > value.price,
    { path: ['compareAtPrice'], error: 'compareAtPrice' },
  )
export type VariantInput = z.output<typeof variantSchema>

export const variantCreateSchema = z.object({
  variant: variantSchema,
  initialStock: z.number().int().min(0).max(100_000),
})

export const categorySchema = z.object({
  slug: slugField.refine((slug) => !RESERVED_CATEGORY_SLUGS.has(slug), { error: 'slugReserved' }),
  nameAr: text(2, 120),
  nameEn: text(2, 120),
  descriptionAr: optionalText(2000),
  descriptionEn: optionalText(2000),
  imageUrl: imageUrlField,
  kind: z.enum(CategoryKind),
  gender: z.enum(Gender).nullable(),
  parentId: uuidField.nullable(),
  sortOrder: z.number().int().min(0).max(10_000),
  isActive: z.boolean(),
  showInNav: z.boolean(),
  seoTitleAr: optionalText(160),
  seoTitleEn: optionalText(160),
  seoDescriptionAr: optionalText(320),
  seoDescriptionEn: optionalText(320),
})
export type CategoryInput = z.output<typeof categorySchema>

export const brandSchema = z.object({
  slug: slugField,
  nameAr: text(2, 120),
  nameEn: text(2, 120),
  descriptionAr: optionalText(2000),
  descriptionEn: optionalText(2000),
  logoUrl: imageUrlField,
  isActive: z.boolean(),
})
export type BrandInput = z.output<typeof brandSchema>

/** Stock changes: receive goods, write off damage, or correct to a physical count. */
export const inventoryAdjustmentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('RESTOCK'),
    quantity: z.number().int().min(1, { error: 'quantity' }).max(100_000, { error: 'quantity' }),
    reason: text(3, 300),
  }),
  z.object({
    type: z.literal('DAMAGE_WRITE_OFF'),
    quantity: z.number().int().min(1, { error: 'quantity' }).max(100_000, { error: 'quantity' }),
    reason: text(3, 300),
  }),
  z.object({
    type: z.literal('COUNT'),
    counted: z.number().int().min(0, { error: 'quantity' }).max(100_000, { error: 'quantity' }),
    reason: text(3, 300),
  }),
])
export type InventoryAdjustmentInput = z.output<typeof inventoryAdjustmentSchema>

export const imageMetaSchema = z.object({
  altAr: optionalText(200),
  altEn: optionalText(200),
})

export const imageOrderSchema = z.object({
  imageIds: z.array(uuidField).min(1).max(50),
})
