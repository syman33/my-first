import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { resolveShopper } from '@/lib/api/shopper'
import { NotFoundError } from '@/lib/errors'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { uuidField } from '@/schemas/common'
import { updateCartItemSchema } from '@/schemas/cart'
import { getCartView, removeCartItem, updateCartItemQuantity } from '@/services/cart/cart.service'

function parseId(raw: string): string {
  const parsed = uuidField.safeParse(raw)
  if (!parsed.success) throw new NotFoundError('NOT_FOUND', 'Cart item not found')
  return parsed.data
}

const limits = {
  auth: 'optional' as const,
  rateLimit: (ctx: { user: { id: string } | null; ip: string }) => [
    { rule: RATE_LIMITS.cartWrite, subject: ctx.user?.id ?? ctx.ip },
  ],
}

export const PATCH = apiHandler<{ id: string }>(limits, async (ctx) => {
  const { quantity } = await ctx.body(updateCartItemSchema)
  const { owner } = resolveShopper(ctx, { create: false })
  if (!owner) throw new NotFoundError('NOT_FOUND', 'Cart item not found')
  await updateCartItemQuantity(owner, parseId(ctx.params.id), quantity)
  return ok({ cart: await getCartView(owner, ctx.locale, { userId: ctx.user?.id ?? null }) })
})

export const DELETE = apiHandler<{ id: string }>(limits, async (ctx) => {
  const { owner } = resolveShopper(ctx, { create: false })
  if (!owner) throw new NotFoundError('NOT_FOUND', 'Cart item not found')
  await removeCartItem(owner, parseId(ctx.params.id))
  return ok({ cart: await getCartView(owner, ctx.locale, { userId: ctx.user?.id ?? null }) })
})
