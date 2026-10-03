import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { resolveShopper } from '@/lib/api/shopper'
import { getWishlistView } from '@/services/wishlist/wishlist.service'

export const GET = apiHandler({ auth: 'optional' }, async (ctx) => {
  const { owner } = resolveShopper(ctx, { create: false })
  const items = await getWishlistView(owner, ctx.locale)
  return ok({
    items: items.map((item) => ({
      productId: item.productId,
      addedAt: item.addedAt,
      card: item.card,
    })),
  })
})
