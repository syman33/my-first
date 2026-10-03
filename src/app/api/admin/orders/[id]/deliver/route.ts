import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { OrderNotFoundError } from '@/lib/errors'
import { orderNoteSchema } from '@/schemas/admin-orders'
import { processPendingEvents } from '@/services/events/process'
import { markDelivered } from '@/services/orders/fulfillment.service'

/** Delivered (for cash on delivery, this records the cash as collected). */
export const POST = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'ORDERS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id, new OrderNotFoundError())
    const { note } = await ctx.body(orderNoteSchema)
    await markDelivered(id, ctx.audit, note)
    ctx.afterResponse(() => processPendingEvents())
    return ok({ status: 'DELIVERED' })
  },
)
