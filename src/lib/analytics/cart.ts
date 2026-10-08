import type { CartLineView, CartView } from '@/types/cart'
import type { AnalyticsItem } from './events'

/** An analytics item from a bag line, with the server's unit price. */
export function cartLineItem(line: CartLineView, quantity = line.quantity): AnalyticsItem {
  return {
    id: line.productId,
    name: line.name,
    variant: line.variantName,
    price: line.unitPrice,
    quantity,
  }
}

/** The item just added, read from the bag the server returned (never from the page). */
export function addedItem(
  cart: CartView,
  variantId: string,
  quantity: number,
): AnalyticsItem | null {
  const line = cart.lines.find((candidate) => candidate.variantId === variantId)
  return line ? cartLineItem(line, quantity) : null
}
