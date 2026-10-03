import type { PricingResult } from '@/lib/pricing/order-totals'
import type { StockLevel } from '@/lib/catalog/presentation'
import type { CouponFailureReason } from '@/lib/errors'

/** Who owns a bag or wishlist: a signed-in customer or a guest (by token hash). */
export type ShopperOwner = { userId: string } | { guestTokenHash: string }

export interface CartLineView {
  id: string
  variantId: string
  productId: string
  sku: string
  name: string
  variantName: string
  href: string
  image: { url: string; alt: string } | null
  unitPrice: number
  compareAtPrice: number | null
  quantity: number
  /** Highest quantity the shopper may choose now (stock and per-item limit). */
  maxQuantity: number
  stock: StockLevel
  lineTotal: number
  issue: 'unavailable' | 'out_of_stock' | 'insufficient_stock' | 'quantity_limit' | null
}

export interface CartView {
  id: string | null
  lines: CartLineView[]
  totals: PricingResult
  couponCode: string | null
  couponIssue: { code: string; reason: CouponFailureReason; minOrderAmount?: number } | null
  /** Checkout is blocked until every line issue is resolved. */
  hasIssues: boolean
  maxQuantityPerItem: number
}
