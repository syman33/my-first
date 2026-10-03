import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { resolveShopper } from '@/lib/api/shopper'
import { NotFoundError } from '@/lib/errors'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { uuidField } from '@/schemas/common'
import { getCartView, moveCartItemToWishlist } from '@/services/cart/cart.service'

export const POST = apiHandler<{ id: string }>(
  {
    auth: 'optional',
    rateLimit: (ctx) => [{ rule: RATE_LIMITS.cartWrite, subject: ctx.user?.id ?? ctx.ip }],
  },
  async (ctx) => {
    const id = uuidField.safeParse(ctx.params.id)
    const { owner } = resolveShopper(ctx, { create: false })
    if (!id.success || !owner) throw new NotFoundError('NOT_FOUND', 'Cart item not found')
    await moveCartItemToWishlist(owner, id.data)
    return ok({ cart: await getCartView(owner, ctx.locale, { userId: ctx.user?.id ?? null }) })
  },
)
