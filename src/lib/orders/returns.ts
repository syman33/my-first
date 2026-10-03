/**
 * Return rules (spec §106) as pure functions, shared by the returns service,
 * the customer order page and the admin screens.
 *
 *   REQUESTED ──► APPROVED ──► RECEIVED ──► COMPLETED
 *       │             │
 *       ├──► REJECTED └──► CANCELLED (parcel never arrived)
 *       └──► CANCELLED (customer withdrew)
 */

export const RETURN_REASONS = [
  'CHANGED_MIND',
  'DEFECTIVE',
  'DAMAGED_IN_TRANSIT',
  'WRONG_ITEM',
  'NOT_AS_DESCRIBED',
  'OTHER',
] as const
export type ReturnReason = (typeof RETURN_REASONS)[number]

export const RETURN_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'RECEIVED',
  'COMPLETED',
  'CANCELLED',
] as const
export type ReturnStatusCode = (typeof RETURN_STATUSES)[number]

const TRANSITIONS: Record<ReturnStatusCode, readonly ReturnStatusCode[]> = {
  REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['RECEIVED', 'CANCELLED'],
  RECEIVED: ['COMPLETED'],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: [],
}

export function canTransitionReturn(from: ReturnStatusCode, to: ReturnStatusCode): boolean {
  return TRANSITIONS[from].includes(to)
}

/** Inspection result of a returned unit: sellable stock goes back on the shelf, damaged stock does not. */
export const ITEM_CONDITIONS = ['SELLABLE', 'DAMAGED'] as const
export type ItemConditionCode = (typeof ITEM_CONDITIONS)[number]

/** Units claimed by a return whose parcel has not reached the warehouse yet. */
export const AWAITING_RECEIPT_STATUSES = ['REQUESTED', 'APPROVED'] as const

const DAY_MS = 24 * 60 * 60 * 1000

/** Last moment a return may be requested, or null when returns are closed. */
export function returnDeadline(deliveredAt: Date | null, windowDays: number): Date | null {
  if (!deliveredAt || windowDays <= 0) return null
  return new Date(deliveredAt.getTime() + windowDays * DAY_MS)
}

export function isWithinReturnWindow(
  deliveredAt: Date | null,
  windowDays: number,
  now: Date,
): boolean {
  const deadline = returnDeadline(deliveredAt, windowDays)
  return deadline !== null && now.getTime() <= deadline.getTime()
}

/**
 * Units of a line the customer can still send back: bought − already back in
 * the warehouse − claimed by returns on their way.
 */
export function returnableQuantity(
  item: { quantity: number; returnedQuantity: number },
  awaitingReceipt: number,
): number {
  return Math.max(item.quantity - item.returnedQuantity - awaitingReceipt, 0)
}

/** What the customer paid for a line, VAT included whichever way prices are shown. */
export function linePaidAmount(
  item: { lineTotal: number; taxAmount: number },
  pricesIncludeTax: boolean,
): number {
  return pricesIncludeTax ? item.lineTotal : item.lineTotal + item.taxAmount
}

/**
 * Refund owed for `units` more units of a line when `alreadyRefunded` units
 * were refunded before. Rounding is cumulative — the share of the first n
 * units is round(paid × n / quantity) — so refunding every unit, in any
 * number of returns, adds up to exactly what was paid: no halala lost or
 * invented.
 */
export function proRataRefund(
  paid: number,
  quantity: number,
  alreadyRefunded: number,
  units: number,
): number {
  if (!Number.isSafeInteger(paid) || paid < 0) throw new RangeError('paid must be ≥ 0 halalas')
  if (!Number.isInteger(quantity) || quantity <= 0) throw new RangeError('quantity must be > 0')
  if (
    !Number.isInteger(alreadyRefunded) ||
    !Number.isInteger(units) ||
    alreadyRefunded < 0 ||
    units < 0 ||
    alreadyRefunded + units > quantity
  ) {
    throw new RangeError('refunded units out of range')
  }
  const share = (n: number) => {
    const exact = BigInt(paid) * BigInt(n)
    const q = BigInt(quantity)
    // Round half up (all values are non-negative).
    return Number((exact * 2n + q) / (2n * q))
  }
  return share(alreadyRefunded + units) - share(alreadyRefunded)
}
