/**
 * Storefront analytics events (spec §79), independent of any provider.
 *
 * Privacy by construction: events describe products and amounts only. There
 * is no field for a customer's name, email, phone, address or account id,
 * and search terms that look like an email or phone number are withheld.
 * Amounts are integer halalas, exactly as the server priced them.
 */

export type AnalyticsProviderName = 'none' | 'console' | 'ga4'

export interface AnalyticsItem {
  /** Product id: the one identifier every page and the bag share, so reports join up. */
  id: string
  name: string
  variant?: string
  /** Unit price in halalas. */
  price: number
  quantity: number
}

export type AnalyticsEvent =
  | { name: 'product_viewed'; item: AnalyticsItem }
  | { name: 'search'; query: string; results: number }
  | { name: 'add_to_cart'; item: AnalyticsItem }
  | { name: 'remove_from_cart'; item: AnalyticsItem }
  | { name: 'add_to_wishlist'; item: AnalyticsItem }
  | { name: 'checkout_started'; value: number; items: AnalyticsItem[] }
  | {
      name: 'purchase_completed'
      /** The public order number (never an internal id). */
      orderNumber: string
      value: number
      tax: number
      shipping: number
      coupon: string | null
      items: AnalyticsItem[]
    }

export const ANALYTICS_CURRENCY = 'SAR'

const EMAIL = /[^\s@]+@[^\s@]+/
const LONG_NUMBER = /\d[\d\s-]{6,}\d/

/** A search term safe to report: trimmed, capped, and withheld if it looks personal. */
export function sanitizeSearchTerm(raw: string): string {
  const term = raw.trim().replace(/\s+/g, ' ').slice(0, 100)
  if (EMAIL.test(term) || LONG_NUMBER.test(term)) return '[withheld]'
  return term
}

const toSar = (halalas: number) => Math.round(halalas) / 100

function ga4Item(item: AnalyticsItem) {
  return {
    item_id: item.id,
    item_name: item.name,
    ...(item.variant ? { item_variant: item.variant } : {}),
    price: toSar(item.price),
    quantity: item.quantity,
  }
}

/** GA4 recommended-event name and parameters for an event. */
export function toGa4(event: AnalyticsEvent): [string, Record<string, unknown>] {
  switch (event.name) {
    case 'product_viewed':
      return [
        'view_item',
        {
          currency: ANALYTICS_CURRENCY,
          value: toSar(event.item.price),
          items: [ga4Item(event.item)],
        },
      ]
    case 'search':
      return ['search', { search_term: event.query, results: event.results }]
    case 'add_to_cart':
    case 'remove_from_cart':
    case 'add_to_wishlist':
      return [
        event.name,
        {
          currency: ANALYTICS_CURRENCY,
          value: toSar(event.item.price * event.item.quantity),
          items: [ga4Item(event.item)],
        },
      ]
    case 'checkout_started':
      return [
        'begin_checkout',
        {
          currency: ANALYTICS_CURRENCY,
          value: toSar(event.value),
          items: event.items.map(ga4Item),
        },
      ]
    case 'purchase_completed':
      return [
        'purchase',
        {
          transaction_id: event.orderNumber,
          currency: ANALYTICS_CURRENCY,
          value: toSar(event.value),
          tax: toSar(event.tax),
          shipping: toSar(event.shipping),
          ...(event.coupon ? { coupon: event.coupon } : {}),
          items: event.items.map(ga4Item),
        },
      ]
  }
}
