import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { resolveShopper } from '@/lib/api/shopper'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { wishlistItemSchema } from '@/schemas/cart'
import { addToWishlist } from '@/services/wishlist/wishlist.service'

export const POST = apiHandler(
  {
    auth: 'optional',
    rateLimit: (ctx) => [{ rule: RATE_LIMITS.cartWrite, subject: ctx.user?.id ?? ctx.ip }],
  },
  async (ctx) => {
    const input = await ctx.body(wishlistItemSchema)
    const shopper = resolveShopper(ctx, { create: true })
    await addToWishlist(shopper.owner!, input)
    return shopper.finalize(ok({ productId: input.productId, inWishlist: true }))
  },
)
