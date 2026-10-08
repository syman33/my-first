import * as z from 'zod'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { NotFoundError } from '@/lib/errors'
import { env } from '@/lib/env'
import { processPendingEvents } from '@/services/events/process'
import { simulateMockPayment } from '@/services/payments/mock-simulator.service'

const schema = z.object({
  providerPaymentId: z.string().regex(/^mock_[A-Za-z0-9_-]{8,64}$/),
  outcome: z.enum(['SUCCESS', 'FAILED', 'CANCELLED']),
})

/** Development payment simulator. Does not exist unless PAYMENT_PROVIDER=mock. */
export const POST = apiHandler({ auth: 'user' }, async (ctx) => {
  if (env().PAYMENT_PROVIDER !== 'mock') throw new NotFoundError('NOT_FOUND', 'Not found')
  const { providerPaymentId, outcome } = await ctx.body(schema)
  const result = await simulateMockPayment(providerPaymentId, outcome, ctx.user.id, ctx.locale)
  ctx.afterResponse(() => processPendingEvents())
  return ok(result)
})
