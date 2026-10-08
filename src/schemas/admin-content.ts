import * as z from 'zod'
import { parseStoreDateTimeLocal } from '@/utils/time'

/** Coupons, banners, CMS pages and FAQ entries (admin input). Money is halalas; percentages are basis points. */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: 'tooLong' })
    .nullish()
    .transform((value) => value || null)

const text = (min: number, max: number) =>
  z
    .string({ error: 'required' })
    .trim()
    .min(min, { error: min <= 1 ? 'required' : 'tooShort' })
    .max(max, { error: 'tooLong' })

/** `<input type="datetime-local">` value in store time (Riyadh); blank → null. */
const storeDateTime = z
  .string()
  .trim()
  .nullish()
  .transform((value, ctx) => {
    if (!value) return null
    try {
      return parseStoreDateTimeLocal(value)
    } catch {
      ctx.addIssue({ code: 'custom', message: 'date' })
      return z.NEVER
    }
  })

const halalas = z
  .number({ error: 'amount' })
  .int({ error: 'amount' })
  .min(0, { error: 'amount' })
  .max(100_000_000, { error: 'amount' })

/** Same-site path or https URL (banner links and images are admin input, rendered for customers). */
const siteOrHttpsUrl = z
  .string()
  .trim()
  .max(500, { error: 'tooLong' })
  .refine(
    (value) => (/^\/(?!\/)/.test(value) && !/\s/.test(value)) || /^https:\/\/[^\s]+$/.test(value),
    { error: 'url' },
  )

export const couponSchema = z
  .object({
    code: z
      .string({ error: 'required' })
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,40}$/, { error: 'couponCode' }),
    descriptionAr: optionalText(300),
    descriptionEn: optionalText(300),
    type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
    /** Basis points for PERCENTAGE (1000 = 10%), halalas for FIXED_AMOUNT. */
    value: z
      .number({ error: 'amount' })
      .int({ error: 'amount' })
      .min(1, { error: 'amount' })
      .max(100_000_000, { error: 'amount' }),
    minOrderAmount: halalas.nullable(),
    maxDiscountAmount: halalas.refine((value) => value > 0, { error: 'amount' }).nullable(),
    startsAt: storeDateTime,
    expiresAt: storeDateTime,
    usageLimit: z.number().int().min(1).max(10_000_000).nullable(),
    usageLimitPerUser: z.number().int().min(1).max(1000).nullable(),
    scope: z.enum(['ALL', 'PRODUCTS', 'CATEGORIES']),
    productSkus: z.array(z.string().trim().toUpperCase().min(1).max(64)).max(500).default([]),
    categoryIds: z.array(z.uuid()).max(200).default([]),
    isActive: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'PERCENTAGE' && value.value > 10_000)
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'amount' })
    if (value.startsAt && value.expiresAt && value.startsAt >= value.expiresAt)
      ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'dateOrder' })
    if (value.scope === 'PRODUCTS' && value.productSkus.length === 0)
      ctx.addIssue({ code: 'custom', path: ['productSkus'], message: 'required' })
    if (value.scope === 'CATEGORIES' && value.categoryIds.length === 0)
      ctx.addIssue({ code: 'custom', path: ['categoryIds'], message: 'required' })
  })
export type CouponInput = z.output<typeof couponSchema>

export const bannerSchema = z
  .object({
    placement: z.enum(['HERO', 'PROMO']),
    titleAr: text(1, 160),
    titleEn: text(1, 160),
    subtitleAr: optionalText(400),
    subtitleEn: optionalText(400),
    ctaLabelAr: optionalText(60),
    ctaLabelEn: optionalText(60),
    linkUrl: siteOrHttpsUrl
      .nullish()
      .or(z.literal(''))
      .transform((value) => value || null),
    imageUrl: siteOrHttpsUrl,
    imageKey: z
      .string()
      .trim()
      .max(300)
      .nullish()
      .transform((value) => value || null),
    mobileImageUrl: siteOrHttpsUrl
      .nullish()
      .or(z.literal(''))
      .transform((value) => value || null),
    altAr: optionalText(200),
    altEn: optionalText(200),
    startsAt: storeDateTime,
    endsAt: storeDateTime,
    isActive: z.boolean(),
    sortOrder: z.number().int().min(0).max(1000),
  })
  .refine((value) => !value.startsAt || !value.endsAt || value.startsAt < value.endsAt, {
    path: ['endsAt'],
    error: 'dateOrder',
  })
export type BannerInput = z.output<typeof bannerSchema>

export const pageSchema = z.object({
  titleAr: text(2, 160),
  titleEn: text(2, 160),
  contentAr: text(1, 50_000),
  contentEn: text(1, 50_000),
  seoTitleAr: optionalText(160),
  seoTitleEn: optionalText(160),
  seoDescriptionAr: optionalText(320),
  seoDescriptionEn: optionalText(320),
  isPublished: z.boolean(),
})
export type PageInput = z.output<typeof pageSchema>

export const faqSchema = z.object({
  questionAr: text(3, 300),
  questionEn: text(3, 300),
  answerAr: text(3, 5000),
  answerEn: text(3, 5000),
  sortOrder: z.number().int().min(0).max(1000),
  isPublished: z.boolean(),
})
export type FaqInput = z.output<typeof faqSchema>
