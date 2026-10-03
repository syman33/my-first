import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { returnCompletionSchema } from '@/schemas/returns'
import { processPendingEvents } from '@/services/events/process'
import { completeReturn } from '@/services/orders/returns.service'

/** Refund a received return and close it (refunds need the refund permission). */
export const POST = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'ORDERS_REFUND', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id)
    const input = await ctx.body(returnCompletionSchema)
    const result = await completeReturn(id, input, ctx.audit)
    ctx.afterResponse(() => processPendingEvents())
    return ok(result)
  },
)
