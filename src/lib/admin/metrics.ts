import type { OrderStatus } from '@/generated/prisma/enums'

/**
 * Definitions behind the dashboard figures, in one place so the numbers,
 * their labels and their tests agree.
 *
 * - A *sale* is an order the store has accepted: confirmed (paid online, or
 *   cash on delivery accepted by staff) and not cancelled. Unpaid online
 *   orders are not sales; cancelled orders never count.
 * - Sales are attributed to the store-local day (or hour) the order was placed.
 * - Refunds count when the money actually went back (SUCCEEDED), on the day
 *   they completed.
 */
export const SALE_STATUSES: readonly OrderStatus[] = [
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'REFUNDED',
]

/** Signed change from `previous` to `current` in basis points (null when there is no base). */
export function changeBps(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 10_000)
}

/** Average order value in halalas, rounded half up; 0 when there are no orders. */
export function averageOrderValue(sales: number, orders: number): number {
  if (orders <= 0) return 0
  return Math.floor((sales * 2 + orders) / (2 * orders))
}
