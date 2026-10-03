import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { resolveShopper } from '@/lib/api/shopper'
import { AppError } from '@/lib/errors'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { applyCouponSchema } from '@/schemas/cart'
import { applyCouponToCart, getCartView, removeCouponFromCart } from '@/services/cart/cart.service'

/** Rate limited per shopper: coupon codes must not be guessable by brute force. */
export const POST = apiHandler(
  {
    auth: 'optional',
    rateLimit: (ctx) => [{ rule: RATE_LIMITS.coupon, subject: ctx.user?.id ?? ctx.ip }],
  },
  async (ctx) => {
    const { code } = await ctx.body(applyCouponSchema)
    const { owner } = resolveShopper(ctx, { create: false })
    if (!owner) throw new AppError('CART_EMPTY', 'Cart is empty', { status: 422 })
    const userId = ctx.user?.id ?? null
    await applyCouponToCart(owner, code, { userId, locale: ctx.locale })
    return ok({ cart: await getCartView(owner, ctx.locale, { userId }) })
  },
)

export const DELETE = apiHandler({ auth: 'optional' }, async (ctx) => {
  const { owner } = resolveShopper(ctx, { create: false })
  if (owner) await removeCouponFromCart(owner)
  return ok({ cart: await getCartView(owner, ctx.locale, { userId: ctx.user?.id ?? null }) })
})
