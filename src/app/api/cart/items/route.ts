import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { resolveShopper } from '@/lib/api/shopper'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { addToCartSchema } from '@/schemas/cart'
import { addToCart, getCartView } from '@/services/cart/cart.service'

export const POST = apiHandler(
  {
    auth: 'optional',
    rateLimit: (ctx) => [{ rule: RATE_LIMITS.cartWrite, subject: ctx.user?.id ?? ctx.ip }],
  },
  async (ctx) => {
    const input = await ctx.body(addToCartSchema)
    const shopper = resolveShopper(ctx, { create: true })
    await addToCart(shopper.owner!, input)
    const cart = await getCartView(shopper.owner, ctx.locale, { userId: ctx.user?.id ?? null })
    return shopper.finalize(ok({ cart }))
  },
)
