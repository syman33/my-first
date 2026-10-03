import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { OrderNotFoundError } from '@/lib/errors'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { uuidField } from '@/schemas/common'
import { initiatePayment } from '@/services/payments/payment.service'

/** Start (or resume) the online payment for the customer's pending order. */
export const POST = apiHandler<{ id: string }>(
  {
    auth: 'user',
    rateLimit: (ctx) => [{ rule: RATE_LIMITS.paymentInit, subject: ctx.user?.id ?? ctx.ip }],
  },
  async (ctx) => {
    const id = uuidField.safeParse(ctx.params.id)
    if (!id.success) throw new OrderNotFoundError()
    return ok(await initiatePayment(id.data, ctx.user.id, ctx.locale))
  },
)
