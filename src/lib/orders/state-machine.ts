/**
 * Order lifecycle (spec §35). Every status change goes through
 * `assertTransition`; anything not listed here is rejected.
 *
 *   PENDING ──► CONFIRMED ──► PROCESSING ──► SHIPPED ──► OUT_FOR_DELIVERY ──► DELIVERED ──► REFUNDED
 *      │            │              │             └──────────────────────────────►┘
 *      └────────────┴──────────────┴──► CANCELLED
 *
 * - CANCELLED: the order did not ship (any payment taken is refunded).
 * - REFUNDED: a delivered order was fully refunded after a return.
 * - CANCELLED and REFUNDED are terminal.
 */

export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
] as const
export type OrderStatusCode = (typeof ORDER_STATUSES)[number]

const TRANSITIONS: Record<OrderStatusCode, readonly OrderStatusCode[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['OUT_FOR_DELIVERY', 'DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
}

export function allowedTransitions(from: OrderStatusCode): readonly OrderStatusCode[] {
  return TRANSITIONS[from]
}

export function canTransition(from: OrderStatusCode, to: OrderStatusCode): boolean {
  return TRANSITIONS[from].includes(to)
}

export function isTerminal(status: OrderStatusCode): boolean {
  return TRANSITIONS[status].length === 0
}

/** Statuses after which the parcel has left the warehouse. */
export function hasShipped(status: OrderStatusCode): boolean {
  return (
    status === 'SHIPPED' ||
    status === 'OUT_FOR_DELIVERY' ||
    status === 'DELIVERED' ||
    status === 'REFUNDED'
  )
}

/**
 * Customer self-service cancellation: allowed only in the configured
 * statuses, never once shipped (the returns process applies then).
 */
export function customerMayCancel(
  status: OrderStatusCode,
  cancellable: readonly OrderStatusCode[],
): boolean {
  return cancellable.includes(status) && !hasShipped(status) && canTransition(status, 'CANCELLED')
}
