import * as z from 'zod'
import { normalizeInternationalPhone } from '@/schemas/common'

/**
 * Store settings, one validated JSON document per group. Every business
 * parameter (fees, thresholds, tax, windows) lives here — editable by admins,
 * never hardcoded in business logic. Money values are integer halalas.
 * Validation messages are dictionary keys under `errors.fields.*`.
 */

const halalas = z
  .number({ error: 'amount' })
  .int({ error: 'amount' })
  .min(0, { error: 'amount' })
  .max(100_000_000, { error: 'amount' })
const wholeNumber = (min: number, max: number) =>
  z
    .number({ error: 'invalid' })
    .int({ error: 'invalid' })
    .min(min, { error: 'invalid' })
    .max(max, { error: 'invalid' })
/** Treat blank form input as "not set". */
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value
const requiredText = (max: number) =>
  z
    .string({ error: 'required' })
    .trim()
    .min(1, { error: 'required' })
    .max(max, { error: 'tooLong' })
const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, { error: 'tooLong' }).optional())
const optionalUrl = z.preprocess(
  blankToUndefined,
  z
    .url({ protocol: /^https$/, error: 'url' })
    .max(300, { error: 'tooLong' })
    .optional(),
)
/** International number stored as E.164 (+9665XXXXXXXX); Saudi local formats are accepted. */
const optionalPhone = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      const normalized = normalizeInternationalPhone(value)
      if (!normalized) {
        ctx.addIssue({ code: 'custom', message: 'phone' })
        return z.NEVER
      }
      return normalized
    })
    .optional(),
)

export const storeSettingsSchema = z.object({
  nameAr: requiredText(80).default('فيلورا'),
  nameEn: requiredText(80).default('VÉLORA'),
  legalNameAr: optionalText(160),
  legalNameEn: optionalText(160),
  email: z.email({ error: 'email' }).max(254, { error: 'tooLong' }).default('care@velora.example'),
  phone: requiredText(30).default('+966 11 000 0000'),
  /** WhatsApp number shown on the contact page (wa.me link). */
  whatsapp: optionalPhone,
  addressAr: requiredText(300).default('الرياض، المملكة العربية السعودية'),
  addressEn: requiredText(300).default('Riyadh, Saudi Arabia'),
  commercialRegistration: z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .regex(/^\d{10}$/, { error: 'commercialRegistration' })
      .optional(),
  ),
  vatNumber: z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .regex(/^3\d{13}3$/, { error: 'vatNumber' })
      .optional(),
  ),
  social: z
    .object({
      instagram: optionalUrl,
      tiktok: optionalUrl,
      x: optionalUrl,
      snapchat: optionalUrl,
    })
    .default({}),
})

export const shippingSettingsSchema = z
  .object({
    standardFee: halalas.default(2_500),
    expressEnabled: z.boolean().default(true),
    expressFee: halalas.default(4_500),
    /** Free STANDARD shipping when the merchandise total after discount reaches this amount. null = never free. */
    freeShippingThreshold: halalas.nullable().default(29_900),
    freeShippingAppliesToExpress: z.boolean().default(false),
    standardDaysMin: wholeNumber(0, 30).default(2),
    standardDaysMax: wholeNumber(0, 30).default(5),
    expressDaysMin: wholeNumber(0, 30).default(1),
    expressDaysMax: wholeNumber(0, 30).default(2),
  })
  .superRefine((s, ctx) => {
    if (s.standardDaysMin > s.standardDaysMax)
      ctx.addIssue({ code: 'custom', path: ['standardDaysMax'], message: 'rangeOrder' })
    if (s.expressDaysMin > s.expressDaysMax)
      ctx.addIssue({ code: 'custom', path: ['expressDaysMax'], message: 'rangeOrder' })
  })

export const taxSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  /** Basis points: 1500 = 15%. Configure to match the merchant's actual registration. */
  rateBps: wholeNumber(0, 10_000).default(1_500),
  /** Displayed prices already include tax (required for B2C display in KSA). */
  pricesIncludeTax: z.boolean().default(true),
  shippingTaxable: z.boolean().default(true),
})

export const codSettingsSchema = z
  .object({
    enabled: z.boolean().default(true),
    fee: halalas.default(1_500),
    minOrder: halalas.default(5_000),
    maxOrder: halalas.default(300_000),
  })
  .superRefine((s, ctx) => {
    if (s.minOrder > s.maxOrder)
      ctx.addIssue({ code: 'custom', path: ['maxOrder'], message: 'rangeOrder' })
  })

export const ORDER_STATUSES_CUSTOMER_MAY_CANCEL = ['PENDING', 'CONFIRMED', 'PROCESSING'] as const

export const checkoutSettingsSchema = z.object({
  /** Order statuses in which a customer may cancel on their own (never after shipment). */
  customerCancellableStatuses: z
    .array(z.enum(ORDER_STATUSES_CUSTOMER_MAY_CANCEL))
    .default(['PENDING', 'CONFIRMED']),
  maxQuantityPerItem: wholeNumber(1, 99).default(10),
  /** Customers must confirm their email address before placing an order. */
  requireEmailVerification: z.boolean().default(false),
  /** How long stock stays reserved for an unpaid online order before it is released. */
  reservationMinutes: wholeNumber(5, 1_440).default(30),
})

export const PAYMENT_METHODS = ['MADA', 'CARD', 'APPLE_PAY', 'STC_PAY', 'COD'] as const

export const paymentSettingsSchema = z.object({
  /** Methods offered at checkout (further limited by what the configured provider supports). */
  enabledMethods: z
    .array(z.enum(PAYMENT_METHODS))
    .min(1, { error: 'required' })
    .default(['MADA', 'CARD', 'APPLE_PAY', 'COD']),
})

export const returnsSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  /** Days after delivery during which a return may be requested. */
  windowDays: wholeNumber(0, 90).default(7),
})

export const reviewSettingsSchema = z.object({
  requireVerifiedPurchase: z.boolean().default(true),
  autoApprove: z.boolean().default(false),
})

export const seoSettingsSchema = z.object({
  titleAr: optionalText(160),
  titleEn: optionalText(160),
  descriptionAr: optionalText(320),
  descriptionEn: optionalText(320),
})

export const settingsSchemas = {
  store: storeSettingsSchema,
  shipping: shippingSettingsSchema,
  tax: taxSettingsSchema,
  cod: codSettingsSchema,
  checkout: checkoutSettingsSchema,
  payments: paymentSettingsSchema,
  returns: returnsSettingsSchema,
  reviews: reviewSettingsSchema,
  seo: seoSettingsSchema,
} as const

export type SettingsGroup = keyof typeof settingsSchemas
export const SETTINGS_GROUPS = Object.keys(settingsSchemas) as SettingsGroup[]
export type SettingsOf<G extends SettingsGroup> = z.output<(typeof settingsSchemas)[G]>
export type AllSettings = { [G in SettingsGroup]: SettingsOf<G> }

export type StoreSettings = SettingsOf<'store'>
export type ShippingSettings = SettingsOf<'shipping'>
export type TaxSettings = SettingsOf<'tax'>
export type CodSettings = SettingsOf<'cod'>
export type CheckoutSettings = SettingsOf<'checkout'>
export type PaymentSettings = SettingsOf<'payments'>
export type ReturnsSettings = SettingsOf<'returns'>
export type ReviewSettings = SettingsOf<'reviews'>

/** Parse a stored document, filling defaults for any missing keys (forward-compatible). */
export function parseSettings<G extends SettingsGroup>(group: G, value: unknown): SettingsOf<G> {
  const schema = settingsSchemas[group] as unknown as z.ZodType<SettingsOf<G>>
  return schema.parse(value ?? {})
}

export function defaultSettings<G extends SettingsGroup>(group: G): SettingsOf<G> {
  return parseSettings(group, {})
}

/**
 * Parse a stored document without letting one bad value break every page:
 * top-level keys that fail validation (e.g. edited by hand in the database)
 * fall back to their defaults and are reported to the caller.
 */
export function parseStoredSettings<G extends SettingsGroup>(
  group: G,
  value: unknown,
): { settings: SettingsOf<G>; invalidKeys: string[] } {
  const schema = settingsSchemas[group] as unknown as z.ZodType<SettingsOf<G>>
  const first = schema.safeParse(value ?? {})
  if (first.success) return { settings: first.data, invalidKeys: [] }
  const invalidKeys = [
    ...new Set(first.error.issues.map((issue) => String(issue.path[0] ?? '(document)'))),
  ]
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const kept = Object.fromEntries(
      Object.entries(value).filter(([key]) => !invalidKeys.includes(key)),
    )
    const second = schema.safeParse(kept)
    if (second.success) return { settings: second.data, invalidKeys }
  }
  return { settings: defaultSettings(group), invalidKeys }
}
