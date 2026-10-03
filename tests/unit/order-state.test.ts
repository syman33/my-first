import { describe, expect, it } from 'vitest'
import {
  allowedTransitions,
  canTransition,
  customerMayCancel,
  hasShipped,
  isTerminal,
  ORDER_STATUSES,
} from '@/lib/orders/state-machine'

describe('order state machine', () => {
  it('follows the fulfilment path', () => {
    const path = [
      'PENDING',
      'CONFIRMED',
      'PROCESSING',
      'SHIPPED',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'REFUNDED',
    ] as const
    for (let i = 0; i < path.length - 1; i++)
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true)
    expect(canTransition('SHIPPED', 'DELIVERED')).toBe(true)
  })

  it.each([
    ['DELIVERED', 'PROCESSING'],
    ['DELIVERED', 'CANCELLED'],
    ['SHIPPED', 'CANCELLED'],
    ['CANCELLED', 'CONFIRMED'],
    ['REFUNDED', 'DELIVERED'],
    ['PENDING', 'SHIPPED'],
    ['PENDING', 'PENDING'],
    ['CONFIRMED', 'PENDING'],
  ] as const)('rejects %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false)
  })

  it('has exactly two terminal states', () => {
    expect(ORDER_STATUSES.filter(isTerminal)).toEqual(['CANCELLED', 'REFUNDED'])
    expect(allowedTransitions('CANCELLED')).toEqual([])
  })

  it('never lets customers cancel after shipment', () => {
    const everything = [...ORDER_STATUSES]
    for (const status of ORDER_STATUSES) {
      if (hasShipped(status)) expect(customerMayCancel(status, everything)).toBe(false)
    }
    expect(customerMayCancel('PENDING', ['PENDING', 'CONFIRMED'])).toBe(true)
    expect(customerMayCancel('PROCESSING', ['PENDING', 'CONFIRMED'])).toBe(false)
    expect(customerMayCancel('PROCESSING', ['PENDING', 'CONFIRMED', 'PROCESSING'])).toBe(true)
  })
})
