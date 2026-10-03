import { z } from 'zod'

/**
 * Store settings, one validated JSON document per group. Every business
 * parameter (fees, thresholds, tax, windows) lives here — editable by admins,
 * never hardcoded in business logic. Money values are integer halalas.
 */

const halalas = z.number().int().min(0).max(100_000_000)
/** Treat blank form input as "not set". */
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value
const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional())
const optionalUrl = z.preprocess(
  blankToUndefined,
  z
    .url({ protocol: /^https$/ })
    .max(300)
    .optional(),
)

export const storeSettingsSchema = z.object({
  nameAr: z.string().trim().min(1).max(80).default('فيلورا'),
  nameEn: z.string().trim().min(1).max(80).default('VÉLORA'),
  legalNameAr: optionalText(160),
  legalNameEn: optionalText(160),
  email: z.email().default('care@velora.example'),
  phone: z.string().trim().max(30).default('+966 11 000 0000'),
  whatsapp: optionalText(30),
  addressAr: z.string().trim().max(300).default('الرياض، المملكة العربية السعودية'),
  addressEn: z.string().trim().max(300).default('Riyadh, Saudi Arabia'),
  commercialRegistration: optionalText(20),
  vatNumber: z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .regex(/^3\d{13}3$/, 'Saudi VAT numbers are 15 digits starting and ending with 3')
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
    standardDaysMin: z.number().int().min(0).max(30).default(2),
    standardDaysMax: z.number().int().min(0).max(30).default(5),
    expressDaysMin: z.number().int().min(0).max(30).default(1),
    expressDaysMax: z.number().int().min(0).max(30).default(2),
  })
  .refine((s) => s.standardDaysMin <= s.standardDaysMax && s.expressDaysMin <= s.expressDaysMax, {
    message: 'Minimum delivery days must not exceed maximum',
  })

export const taxSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  /** Basis points: 1500 = 15%. Configure to match the merchant's actual registration. */
  rateBps: z.number().int().min(0).max(10_000).default(1_500),
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
  .refine((s) => s.minOrder <= s.maxOrder, { message: 'COD minimum must not exceed maximum' })

export const ORDER_STATUSES_CUSTOMER_MAY_CANCEL = ['PENDING', 'CONFIRMED', 'PROCESSING'] as const

export const checkoutSettingsSchema = z.object({
  /** Order statuses in which a customer may cancel on their own (never after shipment). */
  customerCancellableStatuses: z
    .array(z.enum(ORDER_STATUSES_CUSTOMER_MAY_CANCEL))
    .default(['PENDING', 'CONFIRMED']),
  maxQuantityPerItem: z.number().int().min(1).max(99).default(10),
  requireEmailVerification: z.boolean().default(false),
  /** How long stock stays reserved for an unpaid online order before it is released. */
  reservationMinutes: z.number().int().min(5).max(1_440).default(30),
})

export const PAYMENT_METHODS = ['MADA', 'CARD', 'APPLE_PAY', 'STC_PAY', 'COD'] as const

export const paymentSettingsSchema = z.object({
  /** Methods offered at checkout (further limited by what the configured provider supports). */
  enabledMethods: z
    .array(z.enum(PAYMENT_METHODS))
    .min(1)
    .default(['MADA', 'CARD', 'APPLE_PAY', 'COD']),
})

export const returnsSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  /** Days after delivery during which a return may be requested. */
  windowDays: z.number().int().min(0).max(90).default(7),
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
