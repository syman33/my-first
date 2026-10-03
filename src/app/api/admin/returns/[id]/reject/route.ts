import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { returnRejectionSchema } from '@/schemas/returns'
import { processPendingEvents } from '@/services/events/process'
import { rejectReturn } from '@/services/orders/returns.service'

/** Reject a return request; the note is sent to the customer. */
export const POST = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'ORDERS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id)
    const input = await ctx.body(returnRejectionSchema)
    await rejectReturn(id, input, ctx.audit)
    ctx.afterResponse(() => processPendingEvents())
    return ok({ status: 'REJECTED' })
  },
)
