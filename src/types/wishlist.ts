import type { ProductCardData } from '@/lib/catalog/presentation'

export interface WishlistEntryView {
  productId: string
  addedAt: Date
  /** Still published and purchasable in principle (stock is in `card.stock`). */
  available: boolean
  card: ProductCardData
  /** Variant used by "move to bag" without asking, when unambiguous. */
  moveVariantId: string | null
}
