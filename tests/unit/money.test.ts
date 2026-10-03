import { describe, expect, it } from 'vitest'
import {
  addMoney,
  allocateProportionally,
  discountPercent,
  halalasToSarString,
  MoneyError,
  multiplyMoney,
  normalizeNumericInput,
  percentageOf,
  sarToHalalas,
  subtractMoney,
  taxFromExclusive,
  taxFromInclusive,
} from '@/utils/money'

describe('sarToHalalas', () => {
  it.each([
    ['299', 29_900],
    ['299.5', 29_950],
    ['299.50', 29_950],
    ['0.01', 1],
    ['0', 0],
    ['1,299.99', 129_999],
    ['١٢٣٫٤٥', 12_345], // Arabic-Indic digits + Arabic decimal separator
    ['۱۰', 1_000], // Eastern Arabic-Indic digits
    ['  42.10 ', 4_210],
  ])('parses %j → %d halalas', (input, expected) => {
    expect(sarToHalalas(input)).toBe(expected)
  })

  it('parses numbers without floating-point drift', () => {
    expect(sarToHalalas(0.1)).toBe(10)
    expect(sarToHalalas(19.99)).toBe(1999)
    expect(sarToHalalas(1234.56)).toBe(123_456)
  })

  it.each(['12.345', '1e3', 'abc', '', '12.', '.5', '--1', '1.2.3'])('rejects %j', (input) => {
    expect(() => sarToHalalas(input)).toThrow(MoneyError)
  })

  it('rejects floats that carry hidden precision instead of silently rounding', () => {
    expect(() => sarToHalalas(0.1 + 0.2)).toThrow(MoneyError)
    expect(() => sarToHalalas(Number.NaN)).toThrow(MoneyError)
    expect(() => sarToHalalas(Number.POSITIVE_INFINITY)).toThrow(MoneyError)
  })
})

describe('halalasToSarString', () => {
  it.each([
    [0, '0.00'],
    [1, '0.01'],
    [29_950, '299.50'],
    [100, '1.00'],
    [-150, '-1.50'],
  ])('%d → %s', (input, expected) => {
    expect(halalasToSarString(input)).toBe(expected)
  })

  it('round-trips through parsing', () => {
    for (const value of [0, 1, 99, 100, 12_345, 2_147_483_647]) {
      expect(sarToHalalas(halalasToSarString(value))).toBe(value)
    }
  })
})

describe('arithmetic', () => {
  it('adds, subtracts and multiplies exactly', () => {
    expect(addMoney(10, 20, 30)).toBe(60)
    expect(addMoney()).toBe(0)
    expect(subtractMoney(100, 250)).toBe(-150)
    expect(multiplyMoney(29_950, 3)).toBe(89_850)
  })

  it('rejects non-integer inputs', () => {
    expect(() => addMoney(1.5)).toThrow(MoneyError)
    expect(() => multiplyMoney(100, 1.5)).toThrow(MoneyError)
  })

  it('throws instead of losing precision on overflow', () => {
    expect(() => addMoney(Number.MAX_SAFE_INTEGER, 1)).toThrow(MoneyError)
    expect(() => multiplyMoney(Number.MAX_SAFE_INTEGER, 2)).toThrow(MoneyError)
  })
})

describe('percentageOf (half-up rounding)', () => {
  it('computes basis-point percentages', () => {
    expect(percentageOf(10_000, 1_000)).toBe(1_000) // 10% of 100 SAR
    expect(percentageOf(9_995, 1_000)).toBe(1_000) // 99.95 × 10% = 9.995 → 10.00
    expect(percentageOf(9_994, 1_000)).toBe(999) // 9.994 → 9.99
    expect(percentageOf(1, 5_000)).toBe(1) // 0.5 halala rounds up
    expect(percentageOf(12_345, 0)).toBe(0)
    expect(percentageOf(12_345, 10_000)).toBe(12_345)
  })

  it('validates inputs', () => {
    expect(() => percentageOf(-1, 1000)).toThrow(MoneyError)
    expect(() => percentageOf(100, 10_001)).toThrow(MoneyError)
    expect(() => percentageOf(100, 12.5)).toThrow(MoneyError)
  })
})

describe('VAT helpers', () => {
  it('extracts tax contained in an inclusive price', () => {
    expect(taxFromInclusive(11_500, 1_500)).toBe(1_500) // 115 SAR incl. 15% → 15 SAR
    expect(taxFromInclusive(29_900, 1_500)).toBe(3_900) // 299 → 38.9956 → 39.00
    expect(taxFromInclusive(100, 1_500)).toBe(13) // 1.00 → 0.1304 → 0.13
    expect(taxFromInclusive(5_000, 0)).toBe(0)
  })

  it('adds tax on top of an exclusive price', () => {
    expect(taxFromExclusive(10_000, 1_500)).toBe(1_500)
    expect(taxFromExclusive(1_999, 1_500)).toBe(300) // 299.85 → 300
  })

  it('inclusive net + tax always reconstructs the gross', () => {
    for (let gross = 0; gross < 5_000; gross += 7) {
      const tax = taxFromInclusive(gross, 1_500)
      expect(tax).toBeGreaterThanOrEqual(0)
      expect(tax).toBeLessThanOrEqual(gross)
    }
  })
})

describe('allocateProportionally', () => {
  it('always sums exactly to the total', () => {
    const cases: Array<[number, number[]]> = [
      [1_000, [1, 1, 1]],
      [1, [5, 5]],
      [9_999, [29_900, 15_000, 4_500, 1]],
      [0, [10, 20]],
      [7, [0, 0, 1]],
    ]
    for (const [total, weights] of cases) {
      const parts = allocateProportionally(total, weights)
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total)
      parts.forEach((p) => expect(Number.isInteger(p) && p >= 0).toBe(true))
    }
  })

  it('is proportional and deterministic', () => {
    expect(allocateProportionally(1_000, [1, 1, 1])).toEqual([334, 333, 333])
    expect(allocateProportionally(100, [3, 1])).toEqual([75, 25])
    expect(allocateProportionally(10, [0, 5])).toEqual([0, 10])
  })

  it('rejects impossible allocations', () => {
    expect(() => allocateProportionally(10, [])).toThrow(MoneyError)
    expect(() => allocateProportionally(10, [0, 0])).toThrow(MoneyError)
    expect(() => allocateProportionally(10, [-1, 2])).toThrow(MoneyError)
  })
})

describe('discountPercent', () => {
  it('rounds down so a discount is never overstated', () => {
    expect(discountPercent(8_000, 10_000)).toBe(20)
    expect(discountPercent(6_667, 10_000)).toBe(33) // 33.33%
    expect(discountPercent(9_999, 10_000)).toBe(0)
  })

  it('returns 0 when there is no real discount', () => {
    expect(discountPercent(10_000, null)).toBe(0)
    expect(discountPercent(10_000, 10_000)).toBe(0)
    expect(discountPercent(10_000, 9_000)).toBe(0)
  })
})

describe('normalizeNumericInput', () => {
  it('converts Arabic digits and separators', () => {
    expect(normalizeNumericInput('١٬٢٣٤٫٥٠')).toBe('1234.50')
  })
})
