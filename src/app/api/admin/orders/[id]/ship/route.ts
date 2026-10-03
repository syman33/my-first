import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { OrderNotFoundError } from '@/lib/errors'
import { shipOrderSchema } from '@/schemas/admin-orders'
import { processPendingEvents } from '@/services/events/process'
import { shipOrder } from '@/services/orders/fulfillment.service'

/** Hand the parcel to the carrier: records the shipment and emails the customer. */
export const POST = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'ORDERS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id, new OrderNotFoundError())
    const input = await ctx.body(shipOrderSchema)
    const result = await shipOrder(id, input, ctx.audit)
    ctx.afterResponse(() => processPendingEvents())
    return ok({ status: 'SHIPPED', shipmentId: result.shipmentId })
  },
)
