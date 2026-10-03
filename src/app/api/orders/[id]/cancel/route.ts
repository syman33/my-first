import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { OrderNotFoundError } from '@/lib/errors'
import { cancelOrderSchema } from '@/schemas/checkout'
import { uuidField } from '@/schemas/common'
import { processPendingEvents } from '@/services/events/process'
import { cancelOrder } from '@/services/orders/order-lifecycle.service'
import { getCustomerOrder } from '@/services/orders/order-query.service'
import { refundCancelledOrder } from '@/services/payments/payment.service'

/** Customer self-service cancellation; the rules are enforced here, not in the UI. */
export const POST = apiHandler<{ id: string }>({ auth: 'user' }, async (ctx) => {
  const id = uuidField.safeParse(ctx.params.id)
  if (!id.success) throw new OrderNotFoundError()
  const { reason } = await ctx.body(cancelOrderSchema)
  await cancelOrder(id.data, {
    audit: ctx.audit,
    reason: reason ?? 'CUSTOMER_REQUEST',
    byCustomerId: ctx.user.id,
  })
  // A captured payment is refunded right away (failures stay flagged for staff).
  ctx.afterResponse(async () => {
    await refundCancelledOrder(id.data, ctx.audit)
    await processPendingEvents()
  })
  return ok({ order: await getCustomerOrder(ctx.user.id, id.data, ctx.locale) })
})
