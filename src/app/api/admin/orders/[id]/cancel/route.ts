import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { OrderNotFoundError } from '@/lib/errors'
import { cancelOrderAdminSchema } from '@/schemas/admin-orders'
import { processPendingEvents } from '@/services/events/process'
import { cancelOrder } from '@/services/orders/order-lifecycle.service'
import { refundCancelledOrder } from '@/services/payments/payment.service'

/**
 * Cancel an order that has not shipped. Stock goes back; a captured online
 * payment is refunded right after (a failed refund stays flagged on the order).
 */
export const POST = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'ORDERS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id, new OrderNotFoundError())
    const { reason } = await ctx.body(cancelOrderAdminSchema)
    await cancelOrder(id, { audit: ctx.audit, reason })
    ctx.afterResponse(async () => {
      await refundCancelledOrder(id, ctx.audit)
      await processPendingEvents()
    })
    return ok({ status: 'CANCELLED' })
  },
)
