import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { readIdempotencyKey, withIdempotency } from '@/lib/idempotency'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { checkoutSchema } from '@/schemas/checkout'
import { processPendingEvents } from '@/services/events/process'
import { placeOrder } from '@/services/orders/checkout.service'

/**
 * Place an order. Requires a signed-in customer and an Idempotency-Key
 * header: retrying the same request returns the same order instead of
 * creating a second one.
 */
export const POST = apiHandler(
  {
    auth: 'user',
    rateLimit: (ctx) => [{ rule: RATE_LIMITS.checkout, subject: ctx.user?.id ?? ctx.ip }],
  },
  async (ctx) => {
    const key = readIdempotencyKey(ctx.req.headers)
    const input = await ctx.body(checkoutSchema)
    const outcome = await withIdempotency(
      { scope: 'checkout', key, userId: ctx.user.id, body: input },
      () =>
        placeOrder(input, {
          user: ctx.user,
          locale: ctx.locale,
          idempotencyKey: key,
          audit: ctx.audit,
        }),
    )
    if (!outcome.replayed) ctx.afterResponse(() => processPendingEvents())
    return ok({ order: outcome.result, replayed: outcome.replayed })
  },
)
