'use client'

import type { ComponentProps } from 'react'
import { ProductShowcase } from '@/components/catalog/product-showcase'
import type { Dictionary } from '@/i18n'
import { AddToBag } from './add-to-bag'
import { WishlistButton } from './wishlist-button'

type ShowcaseProps = Omit<ComponentProps<typeof ProductShowcase>, 'renderActions'>

interface ProductPurchaseProps extends ShowcaseProps {
  productId: string
  productName: string
  inWishlist: boolean
  addToBagT: Dictionary['cart']['addToBag']
  wishlistT: Dictionary['cart']['wishlist']
  genericError: string
}

/** Product showcase with the purchase actions bound to the selected variant. */
export function ProductPurchase({
  productId,
  productName,
  inWishlist,
  addToBagT,
  wishlistT,
  genericError,
  ...showcase
}: ProductPurchaseProps) {
  return (
    <ProductShowcase
      {...showcase}
      renderActions={(variant) => (
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <AddToBag
              locale={showcase.locale}
              variantId={variant?.id ?? null}
              soldOut={variant?.stock === 'out_of_stock'}
              t={addToBagT}
              genericError={genericError}
            />
          </div>
          <WishlistButton
            locale={showcase.locale}
            productId={productId}
            productName={productName}
            price={variant?.price ?? showcase.variants[0]?.price ?? 0}
            variantId={variant?.id ?? null}
            initialActive={inWishlist}
            variant="outline"
            labels={{
              add: wishlistT.add,
              remove: wishlistT.remove,
              added: wishlistT.added,
              removed: wishlistT.removed,
              error: genericError,
            }}
          />
        </div>
      )}
    />
  )
}
