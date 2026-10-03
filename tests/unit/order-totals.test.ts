import { describe, expect, it } from 'vitest'
import {
  calculateOrderTotals,
  type CouponRule,
  type PricingInput,
  type PricingLine,
} from '@/lib/pricing/order-totals'
import { defaultSettings } from '@/schemas/settings'

const settings = {
  shipping: defaultSettings('shipping'),
  tax: defaultSettings('tax'),
  cod: defaultSettings('cod'),
}

const line = (overrides: Partial<PricingLine> = {}): PricingLine => ({
  variantId: overrides.variantId ?? 'v1',
  productId: overrides.productId ?? 'p1',
  categoryIds: overrides.categoryIds ?? ['bags'],
  unitPrice: overrides.unitPrice ?? 10_000,
  quantity: overrides.quantity ?? 1,
})

const coupon = (overrides: Partial<CouponRule> = {}): CouponRule => ({
  code: 'VELORA10',
  type: 'PERCENTAGE',
  value: 1_000,
  minOrderAmount: null,
  maxDiscountAmount: null,
  scope: 'ALL',
  productIds: [],
  categoryIds: [],
  ...overrides,
})

const totals = (overrides: Partial<PricingInput> = {}) =>
  calculateOrderTotals({
    lines: [line()],
    coupon: null,
    shippingMethod: 'STANDARD',
    paymentMethod: null,
    settings,
    ...overrides,
  })

describe('calculateOrderTotals', () => {
  it('charges standard shipping below the free threshold, VAT included in prices', () => {
    const result = totals({ lines: [line({ unitPrice: 12_000, quantity: 2 })] })
    expect(result).toMatchObject({
      itemCount: 2,
      subtotal: 24_000,
      discountTotal: 0,
      shippingTotal: 2_500,
      freeShipping: false,
      amountToFreeShipping: 5_900,
      total: 26_500,
      // 265.00 SAR gross at 15% contains 34.57 SAR VAT (26,500 × 15 / 115 = 3,456.52 → 3,457).
      taxTotal: 3_457,
      pricesIncludeTax: true,
      taxRateBps: 1_500,
    })
  })

  it('makes standard shipping free from the threshold (after discounts)', () => {
    expect(totals({ lines: [line({ unitPrice: 29_900 })] })).toMatchObject({
      shippingTotal: 0,
      freeShipping: true,
      amountToFreeShipping: null,
    })
    // 310 SAR − 10% = 279 SAR: below 299 again, so shipping is charged.
    const discounted = totals({ lines: [line({ unitPrice: 31_000 })], coupon: coupon() })
    expect(discounted).toMatchObject({
      discountTotal: 3_100,
      shippingTotal: 2_500,
      amountToFreeShipping: 2_000,
    })
  })

  it('never makes express free unless configured', () => {
    const big = [line({ unitPrice: 100_000 })]
    expect(totals({ lines: big, shippingMethod: 'EXPRESS' }).shippingTotal).toBe(4_500)
    const generous = {
      ...settings,
      shipping: { ...settings.shipping, freeShippingAppliesToExpress: true },
    }
    expect(
      totals({ lines: big, shippingMethod: 'EXPRESS', settings: generous }).shippingTotal,
    ).toBe(0)
  })

  it('applies percentage coupons with a cap and allocates the discount to lines', () => {
    const lines = [
      line({ variantId: 'a', unitPrice: 333_333 }),
      line({ variantId: 'b', unitPrice: 166_667 }),
    ]
    const result = totals({ lines, coupon: coupon({ maxDiscountAmount: 30_000 }) })
    expect(result.discountTotal).toBe(30_000)
    expect(result.lines.map((l) => l.discount)).toEqual([20_000, 10_000])
    expect(result.lines.reduce((sum, l) => sum + l.discount, 0)).toBe(result.discountTotal)
    expect(result.coupon).toEqual({ code: 'VELORA10', applied: true, discount: 30_000 })
  })

  it('limits category coupons to eligible lines', () => {
    const lines = [
      line({ variantId: 'bag', productId: 'p-bag', categoryIds: ['bags'], unitPrice: 60_000 }),
      line({
        variantId: 'watch',
        productId: 'p-watch',
        categoryIds: ['watches'],
        unitPrice: 40_000,
      }),
    ]
    const result = totals({
      lines,
      coupon: coupon({ code: 'BAGS15', value: 1_500, scope: 'CATEGORIES', categoryIds: ['bags'] }),
    })
    expect(result.discountTotal).toBe(9_000)
    expect(result.lines.map((l) => l.discount)).toEqual([9_000, 0])
  })

  it('rejects coupons below the minimum order or with no eligible items', () => {
    const min = totals({
      lines: [line({ unitPrice: 19_900 })],
      coupon: coupon({ minOrderAmount: 20_000 }),
    })
    expect(min.coupon).toEqual({
      code: 'VELORA10',
      applied: false,
      reason: 'MIN_ORDER_NOT_MET',
      minOrderAmount: 20_000,
    })
    expect(min.discountTotal).toBe(0)
    const scoped = totals({ coupon: coupon({ scope: 'PRODUCTS', productIds: ['other'] }) })
    expect(scoped.coupon).toMatchObject({ applied: false, reason: 'NOT_APPLICABLE' })
  })

  it('caps fixed discounts at the eligible amount', () => {
    const result = totals({
      lines: [line({ unitPrice: 3_000 })],
      coupon: coupon({ type: 'FIXED_AMOUNT', value: 5_000 }),
    })
    expect(result.discountTotal).toBe(3_000)
    expect(result.total).toBe(2_500) // only shipping left
  })

  it('adds the COD fee and reports COD eligibility from the configured range', () => {
    const cod = totals({ lines: [line({ unitPrice: 40_000 })], paymentMethod: 'COD' })
    expect(cod).toMatchObject({
      codFee: 1_500,
      shippingTotal: 0,
      total: 41_500,
      codAvailable: true,
    })
    expect(totals({ lines: [line({ unitPrice: 1_000 })] }).codAvailable).toBe(false) // 10 + 25 shipping < 50 SAR minimum
    expect(totals({ lines: [line({ unitPrice: 400_000 })] }).codAvailable).toBe(false) // above 3,000 SAR maximum
  })

  it('adds VAT on top when prices exclude tax, and skips it when disabled', () => {
    const exclusive = { ...settings, tax: { ...settings.tax, pricesIncludeTax: false } }
    expect(totals({ lines: [line({ unitPrice: 10_000 })], settings: exclusive })).toMatchObject({
      taxTotal: 1_875, // 15% of (100 + 25 shipping)
      total: 14_375,
    })
    const untaxedShipping = {
      ...settings,
      tax: { ...settings.tax, pricesIncludeTax: false, shippingTaxable: false },
    }
    expect(
      totals({ lines: [line({ unitPrice: 10_000 })], settings: untaxedShipping }).taxTotal,
    ).toBe(1_500)
    const disabled = { ...settings, tax: { ...settings.tax, enabled: false } }
    expect(totals({ settings: disabled })).toMatchObject({ taxTotal: 0, taxRateBps: 0 })
  })

  it('returns zeros for an empty bag', () => {
    expect(totals({ lines: [] })).toMatchObject({
      subtotal: 0,
      shippingTotal: 0,
      total: 0,
      taxTotal: 0,
      itemCount: 0,
      amountToFreeShipping: null,
    })
  })

  it('keeps every amount an integer and total = subtotal − discount + shipping + fees (+ VAT if exclusive)', () => {
    for (let i = 1; i < 60; i++) {
      const result = totals({
        lines: [
          line({ unitPrice: 999 * i + 7, quantity: (i % 3) + 1 }),
          line({ variantId: 'v2', unitPrice: 12_345 }),
        ],
        coupon: coupon({ value: 1_250 + i }),
        paymentMethod: i % 2 ? 'COD' : 'CARD',
      })
      for (const value of [
        result.subtotal,
        result.discountTotal,
        result.shippingTotal,
        result.taxTotal,
        result.total,
      ]) {
        expect(Number.isInteger(value)).toBe(true)
      }
      expect(result.total).toBe(
        result.subtotal - result.discountTotal + result.shippingTotal + result.codFee,
      )
    }
  })
})
