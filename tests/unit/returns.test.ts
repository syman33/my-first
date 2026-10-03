import { describe, expect, it } from 'vitest'
import {
  canTransitionReturn,
  isWithinReturnWindow,
  linePaidAmount,
  proRataRefund,
  RETURN_STATUSES,
  returnableQuantity,
  returnDeadline,
} from '@/lib/orders/returns'
import { returnRequestSchema } from '@/schemas/returns'

const DAY = 24 * 60 * 60 * 1000

describe('return state machine', () => {
  it('follows request → approve → receive → complete, with rejection and withdrawal', () => {
    expect(canTransitionReturn('REQUESTED', 'APPROVED')).toBe(true)
    expect(canTransitionReturn('REQUESTED', 'REJECTED')).toBe(true)
    expect(canTransitionReturn('REQUESTED', 'CANCELLED')).toBe(true)
    expect(canTransitionReturn('APPROVED', 'RECEIVED')).toBe(true)
    expect(canTransitionReturn('APPROVED', 'CANCELLED')).toBe(true)
    expect(canTransitionReturn('RECEIVED', 'COMPLETED')).toBe(true)
  })

  it('never skips inspection or reopens a closed return', () => {
    expect(canTransitionReturn('REQUESTED', 'RECEIVED')).toBe(false)
    expect(canTransitionReturn('APPROVED', 'COMPLETED')).toBe(false)
    expect(canTransitionReturn('RECEIVED', 'CANCELLED')).toBe(false)
    for (const terminal of ['REJECTED', 'COMPLETED', 'CANCELLED'] as const) {
      for (const to of RETURN_STATUSES) expect(canTransitionReturn(terminal, to)).toBe(false)
    }
  })
})

describe('return window', () => {
  const delivered = new Date('2026-09-01T10:00:00Z')

  it('is open until the configured number of days after delivery', () => {
    expect(returnDeadline(delivered, 7)).toEqual(new Date(delivered.getTime() + 7 * DAY))
    expect(isWithinReturnWindow(delivered, 7, new Date(delivered.getTime() + 7 * DAY))).toBe(true)
    expect(isWithinReturnWindow(delivered, 7, new Date(delivered.getTime() + 7 * DAY + 1))).toBe(
      false,
    )
  })

  it('is closed for undelivered orders and when the window is zero', () => {
    expect(returnDeadline(null, 7)).toBeNull()
    expect(isWithinReturnWindow(null, 7, delivered)).toBe(false)
    expect(isWithinReturnWindow(delivered, 0, delivered)).toBe(false)
  })
})

describe('returnable quantity', () => {
  it('subtracts units already back and units on their way', () => {
    expect(returnableQuantity({ quantity: 3, returnedQuantity: 1 }, 1)).toBe(1)
    expect(returnableQuantity({ quantity: 3, returnedQuantity: 0 }, 0)).toBe(3)
    expect(returnableQuantity({ quantity: 2, returnedQuantity: 2 }, 0)).toBe(0)
    expect(returnableQuantity({ quantity: 1, returnedQuantity: 1 }, 1)).toBe(0)
  })
})

describe('refund amounts', () => {
  it('adds exclusive VAT to the line total, never inclusive VAT twice', () => {
    expect(linePaidAmount({ lineTotal: 10_000, taxAmount: 1_304 }, true)).toBe(10_000)
    expect(linePaidAmount({ lineTotal: 10_000, taxAmount: 1_500 }, false)).toBe(11_500)
  })

  it('refunds the exact share of the units returned', () => {
    expect(proRataRefund(50_000, 1, 0, 1)).toBe(50_000)
    expect(proRataRefund(50_000, 2, 0, 1)).toBe(25_000)
    expect(proRataRefund(50_000, 2, 0, 2)).toBe(50_000)
  })

  it('never loses or invents a halala across several partial returns', () => {
    for (const [paid, quantity] of [
      [10_000, 3],
      [9_999, 7],
      [1, 3],
      [123_457, 9],
    ] as const) {
      let refunded = 0
      for (let unit = 0; unit < quantity; unit++) refunded += proRataRefund(paid, quantity, unit, 1)
      expect(refunded).toBe(paid)
      // Same total whatever the grouping of units into returns.
      const firstTwo = proRataRefund(paid, quantity, 0, 2)
      const rest = proRataRefund(paid, quantity, 2, quantity - 2)
      expect(firstTwo + rest).toBe(paid)
    }
  })

  it('rejects impossible unit counts', () => {
    expect(() => proRataRefund(10_000, 2, 1, 2)).toThrow(RangeError)
    expect(() => proRataRefund(10_000, 0, 0, 1)).toThrow(RangeError)
    expect(() => proRataRefund(-1, 1, 0, 1)).toThrow(RangeError)
    expect(() => proRataRefund(10_000, 2, 0, -1)).toThrow(RangeError)
  })
})

describe('return request schema', () => {
  const item = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b'

  it('accepts items, a known reason and an optional note', () => {
    const parsed = returnRequestSchema.parse({
      items: [{ orderItemId: item, quantity: 1 }],
      reason: 'DEFECTIVE',
      note: '  strap broke  ',
    })
    expect(parsed).toEqual({
      items: [{ orderItemId: item, quantity: 1 }],
      reason: 'DEFECTIVE',
      note: 'strap broke',
    })
    expect(returnRequestSchema.parse(parsed)).toEqual(parsed)
  })

  it('carries no amounts and rejects empty, duplicate or invalid lines', () => {
    expect(returnRequestSchema.safeParse({ items: [], reason: 'OTHER' }).success).toBe(false)
    expect(
      returnRequestSchema.safeParse({
        items: [
          { orderItemId: item, quantity: 1 },
          { orderItemId: item, quantity: 1 },
        ],
        reason: 'OTHER',
      }).success,
    ).toBe(false)
    expect(
      returnRequestSchema.safeParse({
        items: [{ orderItemId: item, quantity: 0 }],
        reason: 'OTHER',
      }).success,
    ).toBe(false)
    expect(
      returnRequestSchema.safeParse({ items: [{ orderItemId: item, quantity: 1 }], reason: 'X' })
        .success,
    ).toBe(false)
    const withAmount = returnRequestSchema.parse({
      items: [{ orderItemId: item, quantity: 1 }],
      reason: 'OTHER',
      refundAmount: 999_999,
    })
    expect(withAmount).not.toHaveProperty('refundAmount')
  })
})
