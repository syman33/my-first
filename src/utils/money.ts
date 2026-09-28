/**
 * Money utilities.
 *
 * Every monetary amount in VÉLORA is an integer number of **halalas**
 * (1 SAR = 100 halalas). Floating-point arithmetic is never used for money:
 * parsing works on strings, multiplication/division uses BigInt, and every
 * rounding step is explicit (commercial "half-up" rounding).
 *
 * This module is pure and framework-free so it can be shared by the server
 * (authoritative calculations) and the client (display only).
 */

/** Integer amount of halalas. The alias documents intent; values are validated at runtime. */
export type Halalas = number

export const HALALAS_PER_SAR = 100
/** Basis points: 10000 bps = 100%. Used for tax rates and percentage discounts. */
export const BPS_DENOMINATOR = 10_000

/** Upper bound for a single stored amount (fits PostgreSQL INTEGER). ≈ 21.4M SAR. */
export const MAX_STORED_HALALAS = 2_147_483_647

export class MoneyError extends Error {
  override name = 'MoneyError'
}

export function isHalalas(value: unknown): value is Halalas {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

export function assertHalalas(value: unknown, label = 'amount'): asserts value is Halalas {
  if (!isHalalas(value)) {
    throw new MoneyError(`${label} must be an integer number of halalas, received ${String(value)}`)
  }
}

export function assertNonNegativeHalalas(value: unknown, label = 'amount'): asserts value is Halalas {
  assertHalalas(value, label)
  if (value < 0) throw new MoneyError(`${label} must not be negative, received ${value}`)
}

function checkSafe(value: bigint, label: string): Halalas {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new MoneyError(`${label} overflowed the safe integer range`)
  }
  return Number(value)
}

/** Sum any number of amounts, throwing on overflow instead of silently losing precision. */
export function addMoney(...values: Halalas[]): Halalas {
  let total = 0n
  for (const v of values) {
    assertHalalas(v)
    total += BigInt(v)
  }
  return checkSafe(total, 'sum')
}

export function subtractMoney(a: Halalas, b: Halalas): Halalas {
  assertHalalas(a)
  assertHalalas(b)
  return checkSafe(BigInt(a) - BigInt(b), 'difference')
}

/** unit price × quantity */
export function multiplyMoney(unit: Halalas, quantity: number): Halalas {
  assertHalalas(unit, 'unit amount')
  if (!Number.isSafeInteger(quantity)) throw new MoneyError(`quantity must be an integer, received ${quantity}`)
  return checkSafe(BigInt(unit) * BigInt(quantity), 'product')
}

/**
 * Integer division of non-negative BigInts rounding half-up
 * (0.5 halala rounds away from zero), the convention for commercial amounts.
 */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new MoneyError('denominator must be positive')
  if (numerator < 0n) throw new MoneyError('numerator must be non-negative')
  return (numerator * 2n + denominator) / (denominator * 2n)
}

/** `amount × bps / 10000`, rounded half-up. E.g. 10% (1000 bps) of 99.95 SAR = 10.00 SAR (999.5 → 1000). */
export function percentageOf(amount: Halalas, basisPoints: number): Halalas {
  assertNonNegativeHalalas(amount)
  assertBasisPoints(basisPoints)
  return checkSafe(divideRoundHalfUp(BigInt(amount) * BigInt(basisPoints), BigInt(BPS_DENOMINATOR)), 'percentage')
}

export function assertBasisPoints(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > BPS_DENOMINATOR) {
    throw new MoneyError(`basis points must be an integer between 0 and ${BPS_DENOMINATOR}, received ${bps}`)
  }
}

/**
 * Tax contained in a tax-inclusive gross amount: `gross × rate / (1 + rate)`.
 * Example: 115.00 SAR at 15% contains 15.00 SAR VAT.
 */
export function taxFromInclusive(gross: Halalas, rateBps: number): Halalas {
  assertNonNegativeHalalas(gross, 'gross amount')
  assertBasisPoints(rateBps)
  if (rateBps === 0) return 0
  return checkSafe(
    divideRoundHalfUp(BigInt(gross) * BigInt(rateBps), BigInt(BPS_DENOMINATOR + rateBps)),
    'inclusive tax',
  )
}

/** Tax to add on top of a tax-exclusive net amount: `net × rate`. */
export function taxFromExclusive(net: Halalas, rateBps: number): Halalas {
  return percentageOf(net, rateBps)
}

/**
 * Split `total` into integer parts proportional to `weights` so that the parts
 * always sum exactly to `total` (largest-remainder method; ties go to the
 * earlier index, which keeps results deterministic).
 *
 * Used to spread an order-level discount across line items for invoice
 * snapshots without losing or inventing a single halala.
 */
export function allocateProportionally(total: Halalas, weights: readonly number[]): Halalas[] {
  assertNonNegativeHalalas(total, 'total')
  if (weights.length === 0) {
    if (total !== 0) throw new MoneyError('cannot allocate a non-zero total across zero weights')
    return []
  }
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0) throw new MoneyError(`weights must be non-negative integers, received ${w}`)
  }
  const weightSum = weights.reduce((s, w) => s + BigInt(w), 0n)
  if (weightSum === 0n) {
    if (total === 0) return weights.map(() => 0)
    throw new MoneyError('cannot allocate a non-zero total across zero weights')
  }
  const bigTotal = BigInt(total)
  const shares = weights.map((w, index) => {
    const exact = bigTotal * BigInt(w)
    return { index, floor: exact / weightSum, remainder: exact % weightSum }
  })
  let distributed = shares.reduce((s, x) => s + x.floor, 0n)
  const byRemainder = [...shares].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  )
  const result = shares.map((s) => s.floor)
  for (const share of byRemainder) {
    if (distributed >= bigTotal) break
    result[share.index] = (result[share.index] ?? 0n) + 1n
    distributed += 1n
  }
  return result.map((v) => checkSafe(v, 'allocation'))
}

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const EASTERN_ARABIC_INDIC_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

/** Normalise Arabic-Indic digits and Arabic separators so admin input like "١٢٣٫٥٠" parses. */
export function normalizeNumericInput(input: string): string {
  let out = ''
  for (const ch of input.trim()) {
    const a = ARABIC_INDIC_DIGITS.indexOf(ch)
    const e = EASTERN_ARABIC_INDIC_DIGITS.indexOf(ch)
    if (a >= 0) out += String(a)
    else if (e >= 0) out += String(e)
    else if (ch === '٫') out += '.' // Arabic decimal separator
    else if (ch === '٬' || ch === ',' || ch === ' ' || ch === ' ') continue // grouping separators
    else out += ch
  }
  return out
}

/**
 * Parse a SAR amount ("299", "299.5", "1,299.50", "١٢٩٩٫٥٠") into halalas.
 * More than two decimal places is rejected rather than silently rounded.
 */
export function sarToHalalas(input: string | number): Halalas {
  let text: string
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new MoneyError(`invalid amount: ${input}`)
    text = String(input)
    if (/e/i.test(text)) throw new MoneyError(`amount out of range: ${input}`)
  } else {
    text = normalizeNumericInput(input)
  }
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(text)
  if (!match) throw new MoneyError(`invalid SAR amount: "${String(input)}"`)
  const [, sign, whole = '0', fraction = ''] = match
  const halalas = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0') || '0')
  return checkSafe(sign ? -halalas : halalas, 'amount')
}

/** Plain machine format with two decimals and no grouping: 29950 → "299.50". */
export function halalasToSarString(amount: Halalas): string {
  assertHalalas(amount)
  const negative = amount < 0
  const abs = BigInt(Math.abs(amount))
  const whole = abs / 100n
  const fraction = (abs % 100n).toString().padStart(2, '0')
  return `${negative ? '-' : ''}${whole.toString()}.${fraction}`
}

/** Whole-percent discount between a compare-at price and the selling price, rounded down (never overstated). */
export function discountPercent(price: Halalas, compareAtPrice: Halalas | null | undefined): number {
  assertNonNegativeHalalas(price, 'price')
  if (compareAtPrice === null || compareAtPrice === undefined) return 0
  assertNonNegativeHalalas(compareAtPrice, 'compareAtPrice')
  if (compareAtPrice <= price || compareAtPrice === 0) return 0
  return Number(((BigInt(compareAtPrice) - BigInt(price)) * 100n) / BigInt(compareAtPrice))
}
