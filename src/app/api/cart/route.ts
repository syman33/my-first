import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { resolveShopper } from '@/lib/api/shopper'
import { getCartView } from '@/services/cart/cart.service'

export const GET = apiHandler({ auth: 'optional' }, async (ctx) => {
  const { owner } = resolveShopper(ctx, { create: false })
  return ok({ cart: await getCartView(owner, ctx.locale, { userId: ctx.user?.id ?? null }) })
})
