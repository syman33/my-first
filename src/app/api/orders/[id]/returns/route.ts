import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { OrderNotFoundError } from '@/lib/errors'
import { readIdempotencyKey, withIdempotency } from '@/lib/idempotency'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { uuidField } from '@/schemas/common'
import { returnRequestSchema } from '@/schemas/returns'
import { processPendingEvents } from '@/services/events/process'
import { requestReturn } from '@/services/orders/returns.service'

/**
 * Request a return for a delivered order. Eligibility (owner, status, return
 * window, quantities still returnable) is decided by the server; the
 * Idempotency-Key makes a double-submitted form create one request.
 */
export const POST = apiHandler<{ id: string }>(
  {
    auth: 'user',
    rateLimit: (ctx) => [{ rule: RATE_LIMITS.returnRequest, subject: ctx.user?.id ?? ctx.ip }],
  },
  async (ctx) => {
    const id = uuidField.safeParse(ctx.params.id)
    if (!id.success) throw new OrderNotFoundError()
    const key = readIdempotencyKey(ctx.req.headers)
    const input = await ctx.body(returnRequestSchema)
    const outcome = await withIdempotency(
      { scope: `return:${id.data}`, key, userId: ctx.user.id, body: input },
      () => requestReturn(ctx.user.id, id.data, input, ctx.audit),
    )
    if (!outcome.replayed) ctx.afterResponse(() => processPendingEvents())
    return ok({ return: outcome.result, replayed: outcome.replayed })
  },
)
