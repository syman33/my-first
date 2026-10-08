import { describe, expect, it } from 'vitest'
import { type AnalyticsEvent, sanitizeSearchTerm, toGa4 } from '@/lib/analytics/events'
import { isClientDisconnect } from '@/instrumentation.node'

const item = { id: 'p-1', name: 'Luna Shoulder Bag', variant: 'Black', price: 129_000, quantity: 2 }

describe('analytics events', () => {
  it('withholds search terms that look like an email or a phone number', () => {
    expect(sanitizeSearchTerm('  luna   bag ')).toBe('luna bag')
    expect(sanitizeSearchTerm('noura@example.com')).toBe('[withheld]')
    expect(sanitizeSearchTerm('0551234567')).toBe('[withheld]')
    expect(sanitizeSearchTerm('+966 55 123 4567')).toBe('[withheld]')
    expect(sanitizeSearchTerm('VLR-BAG-LUNA')).toBe('VLR-BAG-LUNA')
    expect(sanitizeSearchTerm('x'.repeat(300))).toHaveLength(100)
  })

  it('maps to GA4 recommended events with riyal amounts', () => {
    expect(toGa4({ name: 'add_to_cart', item })).toEqual([
      'add_to_cart',
      {
        currency: 'SAR',
        value: 2580,
        items: [
          {
            item_id: 'p-1',
            item_name: 'Luna Shoulder Bag',
            item_variant: 'Black',
            price: 1290,
            quantity: 2,
          },
        ],
      },
    ])
    const [name, params] = toGa4({
      name: 'purchase_completed',
      orderNumber: 'VLR-2026-000123',
      value: 145_050,
      tax: 18_920,
      shipping: 0,
      coupon: 'VELORA10',
      items: [item],
    })
    expect(name).toBe('purchase')
    expect(params).toMatchObject({
      transaction_id: 'VLR-2026-000123',
      value: 1450.5,
      tax: 189.2,
      shipping: 0,
      coupon: 'VELORA10',
    })
    expect(toGa4({ name: 'checkout_started', value: 0, items: [] })[0]).toBe('begin_checkout')
    expect(toGa4({ name: 'product_viewed', item })[0]).toBe('view_item')
  })

  it('has no place for personal data in any event', () => {
    const events: AnalyticsEvent[] = [
      { name: 'product_viewed', item },
      { name: 'search', query: 'luna', results: 3 },
      { name: 'add_to_cart', item },
      { name: 'remove_from_cart', item },
      { name: 'add_to_wishlist', item },
      { name: 'checkout_started', value: 1, items: [item] },
      {
        name: 'purchase_completed',
        orderNumber: 'VLR-2026-000001',
        value: 1,
        tax: 0,
        shipping: 0,
        coupon: null,
        items: [item],
      },
    ]
    const keys = new Set<string>()
    const collect = (value: unknown) => {
      if (value && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value)) {
          keys.add(key)
          collect(nested)
        }
      }
    }
    for (const event of events) collect(toGa4(event)[1])
    for (const forbidden of ['email', 'phone', 'user_id', 'name', 'address', 'city']) {
      expect([...keys].filter((key) => key === forbidden)).toEqual([])
    }
  })
})

describe('request error reporting', () => {
  it('treats a browser hanging up as a disconnect, not a server failure', () => {
    expect(isClientDisconnect(new Error('The destination stream closed early.'))).toBe(true)
    expect(
      isClientDisconnect(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })),
    ).toBe(true)
    expect(isClientDisconnect(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isClientDisconnect('a string')).toBe(false)
  })
})
