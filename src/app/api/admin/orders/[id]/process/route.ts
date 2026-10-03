import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { OrderNotFoundError } from '@/lib/errors'
import { orderNoteSchema } from '@/schemas/admin-orders'
import { startProcessing } from '@/services/orders/fulfillment.service'

/** Start preparing a confirmed order. */
export const POST = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'ORDERS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id, new OrderNotFoundError())
    const { note } = await ctx.body(orderNoteSchema)
    await startProcessing(id, ctx.audit, note)
    return ok({ status: 'PROCESSING' })
  },
)
