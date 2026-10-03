import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { resolveShopper } from '@/lib/api/shopper'
import { NotFoundError } from '@/lib/errors'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { uuidField } from '@/schemas/common'
import { removeFromWishlist } from '@/services/wishlist/wishlist.service'

export const DELETE = apiHandler<{ productId: string }>(
  {
    auth: 'optional',
    rateLimit: (ctx) => [{ rule: RATE_LIMITS.cartWrite, subject: ctx.user?.id ?? ctx.ip }],
  },
  async (ctx) => {
    const productId = uuidField.safeParse(ctx.params.productId)
    if (!productId.success) throw new NotFoundError('NOT_FOUND', 'Wishlist item not found')
    const { owner } = resolveShopper(ctx, { create: false })
    if (owner) await removeFromWishlist(owner, productId.data)
    return ok({ productId: productId.data, inWishlist: false })
  },
)
