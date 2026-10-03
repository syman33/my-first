import type { CouponFailureReason } from '@/lib/errors'
import type { CodSettings, ShippingSettings, TaxSettings } from '@/schemas/settings'
import {
  addMoney,
  allocateProportionally,
  type Halalas,
  multiplyMoney,
  percentageOf,
  subtractMoney,
  taxFromExclusive,
  taxFromInclusive,
} from '@/utils/money'

/**
 * THE authoritative order calculation (spec §103): one pure function used by
 * the bag, checkout preview and order creation, so prices can never drift
 * between screens and the stored order.
 *
 *   subtotal − discount + shipping + COD fee (+ VAT when prices exclude it) = total
 *
 * Every amount is integer halalas. Inputs come from the database — never
 * from the client — and are re-read at checkout.
 */

export type ShippingMethodCode = 'STANDARD' | 'EXPRESS'
export type PaymentMethodCode = 'MADA' | 'CARD' | 'APPLE_PAY' | 'STC_PAY' | 'COD'

export interface PricingLine {
  variantId: string
  productId: string
  /** The product's category and all of its ancestors (for category-scoped coupons). */
  categoryIds: readonly string[]
  /** Effective selling price per unit, as displayed (tax-inclusive when prices include tax). */
  unitPrice: Halalas
  quantity: number
}

export interface CouponRule {
  code: string
  type: 'PERCENTAGE' | 'FIXED_AMOUNT'
  /** Basis points for PERCENTAGE (1000 = 10%), halalas for FIXED_AMOUNT. */
  value: number
  minOrderAmount: Halalas | null
  maxDiscountAmount: Halalas | null
  scope: 'ALL' | 'PRODUCTS' | 'CATEGORIES'
  productIds: readonly string[]
  categoryIds: readonly string[]
}

export interface PricingSettings {
  shipping: ShippingSettings
  tax: TaxSettings
  cod: CodSettings
}

export interface PricingInput {
  lines: readonly PricingLine[]
  coupon: CouponRule | null
  shippingMethod: ShippingMethodCode
  paymentMethod: PaymentMethodCode | null
  settings: PricingSettings
}

export interface PricedLine {
  variantId: string
  unitPrice: Halalas
  quantity: number
  /** unitPrice × quantity */
  subtotal: Halalas
  /** Share of the coupon discount (0 for ineligible lines). */
  discount: Halalas
  /** subtotal − discount */
  total: Halalas
}

export interface PricingResult {
  lines: PricedLine[]
  itemCount: number
  subtotal: Halalas
  discountTotal: Halalas
  coupon:
    | { code: string; applied: true; discount: Halalas }
    | { code: string; applied: false; reason: CouponFailureReason; minOrderAmount?: Halalas }
    | null
  shippingTotal: Halalas
  freeShipping: boolean
  /** How much more merchandise unlocks free standard shipping (null: not applicable or already free). */
  amountToFreeShipping: Halalas | null
  codFee: Halalas
  /** COD is offered for this order (enabled and within the configured order value range). */
  codAvailable: boolean
  taxTotal: Halalas
  taxRateBps: number
  pricesIncludeTax: boolean
  total: Halalas
}

function lineEligible(line: PricingLine, coupon: CouponRule): boolean {
  switch (coupon.scope) {
    case 'ALL':
      return true
    case 'PRODUCTS':
      return coupon.productIds.includes(line.productId)
    case 'CATEGORIES':
      return line.categoryIds.some((id) => coupon.categoryIds.includes(id))
  }
}

/** Discount for a coupon (rules that need the database — dates, usage — are checked by the caller). */
export function couponDiscount(
  coupon: CouponRule,
  lines: readonly { line: PricingLine; subtotal: Halalas }[],
  subtotal: Halalas,
): { discount: Halalas; perLine: Halalas[] } | { reason: CouponFailureReason } {
  if (coupon.minOrderAmount !== null && subtotal < coupon.minOrderAmount)
    return { reason: 'MIN_ORDER_NOT_MET' }
  const weights = lines.map(({ line, subtotal: s }) => (lineEligible(line, coupon) ? s : 0))
  const eligible = addMoney(...weights, 0)
  if (eligible === 0) return { reason: 'NOT_APPLICABLE' }
  let discount =
    coupon.type === 'PERCENTAGE'
      ? percentageOf(eligible, Math.min(coupon.value, 10_000))
      : Math.min(coupon.value, eligible)
  if (coupon.maxDiscountAmount !== null) discount = Math.min(discount, coupon.maxDiscountAmount)
  discount = Math.max(0, Math.min(discount, eligible))
  return { discount, perLine: allocateProportionally(discount, weights) }
}

function shippingFor(
  method: ShippingMethodCode,
  merchandiseAfterDiscount: Halalas,
  settings: ShippingSettings,
): { fee: Halalas; free: boolean } {
  const reachesThreshold =
    settings.freeShippingThreshold !== null &&
    merchandiseAfterDiscount >= settings.freeShippingThreshold
  if (method === 'EXPRESS') {
    const free = reachesThreshold && settings.freeShippingAppliesToExpress
    return { fee: free ? 0 : settings.expressFee, free }
  }
  return { fee: reachesThreshold ? 0 : settings.standardFee, free: reachesThreshold }
}

export function calculateOrderTotals(input: PricingInput): PricingResult {
  const { settings } = input
  const subtotals = input.lines.map((line) => ({
    line,
    subtotal: multiplyMoney(line.unitPrice, line.quantity),
  }))
  const subtotal = addMoney(...subtotals.map((s) => s.subtotal), 0)
  const itemCount = input.lines.reduce((sum, line) => sum + line.quantity, 0)

  let discountTotal = 0
  let perLine = subtotals.map(() => 0)
  let coupon: PricingResult['coupon'] = null
  if (input.coupon) {
    const outcome = couponDiscount(input.coupon, subtotals, subtotal)
    if ('reason' in outcome) {
      coupon = {
        code: input.coupon.code,
        applied: false,
        reason: outcome.reason,
        ...(outcome.reason === 'MIN_ORDER_NOT_MET' && input.coupon.minOrderAmount !== null
          ? { minOrderAmount: input.coupon.minOrderAmount }
          : {}),
      }
    } else {
      discountTotal = outcome.discount
      perLine = outcome.perLine
      coupon = { code: input.coupon.code, applied: true, discount: outcome.discount }
    }
  }

  const merchandise = subtractMoney(subtotal, discountTotal)
  const shipping =
    input.lines.length > 0
      ? shippingFor(input.shippingMethod, merchandise, settings.shipping)
      : { fee: 0, free: false }
  const threshold = settings.shipping.freeShippingThreshold
  const amountToFreeShipping =
    threshold !== null &&
    !shipping.free &&
    input.shippingMethod === 'STANDARD' &&
    input.lines.length > 0
      ? subtractMoney(threshold, Math.min(merchandise, threshold))
      : null

  const codFee = input.paymentMethod === 'COD' ? settings.cod.fee : 0
  const tax = settings.tax
  const feesTaxable = tax.shippingTaxable
  const taxableFees = feesTaxable ? addMoney(shipping.fee, codFee) : 0
  const preTaxTotal = addMoney(merchandise, shipping.fee, codFee)

  let taxTotal = 0
  let total = preTaxTotal
  if (tax.enabled && tax.rateBps > 0) {
    const taxableBase = addMoney(merchandise, taxableFees)
    if (tax.pricesIncludeTax) {
      taxTotal = taxFromInclusive(taxableBase, tax.rateBps)
    } else {
      taxTotal = taxFromExclusive(taxableBase, tax.rateBps)
      total = addMoney(preTaxTotal, taxTotal)
    }
  }

  const codRangeTotal = input.paymentMethod === 'COD' ? subtractMoney(total, codFee) : total
  const codAvailable =
    settings.cod.enabled &&
    codRangeTotal >= settings.cod.minOrder &&
    codRangeTotal <= settings.cod.maxOrder

  return {
    lines: subtotals.map(({ line, subtotal: lineSubtotal }, index) => ({
      variantId: line.variantId,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      subtotal: lineSubtotal,
      discount: perLine[index] ?? 0,
      total: subtractMoney(lineSubtotal, perLine[index] ?? 0),
    })),
    itemCount,
    subtotal,
    discountTotal,
    coupon,
    shippingTotal: shipping.fee,
    freeShipping: shipping.free,
    amountToFreeShipping,
    codFee,
    codAvailable,
    taxTotal,
    taxRateBps: tax.enabled ? tax.rateBps : 0,
    pricesIncludeTax: tax.pricesIncludeTax,
    total,
  }
}
