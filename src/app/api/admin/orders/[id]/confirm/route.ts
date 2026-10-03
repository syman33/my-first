import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { OrderNotFoundError } from '@/lib/errors'
import { orderNoteSchema } from '@/schemas/admin-orders'
import { processPendingEvents } from '@/services/events/process'
import { confirmCodOrder } from '@/services/orders/order-lifecycle.service'

/** Accept a cash-on-delivery order (online orders confirm only through their payment). */
export const POST = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'ORDERS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id, new OrderNotFoundError())
    const { note } = await ctx.body(orderNoteSchema)
    await confirmCodOrder(id, ctx.audit, note)
    ctx.afterResponse(() => processPendingEvents())
    return ok({ status: 'CONFIRMED' })
  },
)
