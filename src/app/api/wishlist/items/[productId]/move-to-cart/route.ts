import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { resolveShopper } from '@/lib/api/shopper'
import { NotFoundError } from '@/lib/errors'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { moveToCartSchema } from '@/schemas/cart'
import { uuidField } from '@/schemas/common'
import { getCartView } from '@/services/cart/cart.service'
import { moveWishlistItemToCart } from '@/services/wishlist/wishlist.service'

export const POST = apiHandler<{ productId: string }>(
  {
    auth: 'optional',
    rateLimit: (ctx) => [{ rule: RATE_LIMITS.cartWrite, subject: ctx.user?.id ?? ctx.ip }],
  },
  async (ctx) => {
    const productId = uuidField.safeParse(ctx.params.productId)
    const { owner } = resolveShopper(ctx, { create: false })
    if (!productId.success || !owner)
      throw new NotFoundError('NOT_FOUND', 'Wishlist item not found')
    const { variantId } = await ctx.body(moveToCartSchema)
    await moveWishlistItemToCart(owner, { productId: productId.data, variantId }, ctx.locale)
    return ok({ cart: await getCartView(owner, ctx.locale, { userId: ctx.user?.id ?? null }) })
  },
)
