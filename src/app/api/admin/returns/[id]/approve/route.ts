import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { returnDecisionSchema } from '@/schemas/returns'
import { processPendingEvents } from '@/services/events/process'
import { approveReturn } from '@/services/orders/returns.service'

export const POST = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'ORDERS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id)
    const input = await ctx.body(returnDecisionSchema)
    await approveReturn(id, input, ctx.audit)
    ctx.afterResponse(() => processPendingEvents())
    return ok({ status: 'APPROVED' })
  },
)
