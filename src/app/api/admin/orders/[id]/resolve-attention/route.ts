import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { OrderNotFoundError } from '@/lib/errors'
import { resolveAttentionSchema } from '@/schemas/admin-orders'
import { resolveOrderAttention } from '@/services/orders/order-lifecycle.service'

/** Clear the "needs attention" flag with a note saying what was done. */
export const POST = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'ORDERS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id, new OrderNotFoundError())
    const { note } = await ctx.body(resolveAttentionSchema)
    await resolveOrderAttention(id, note, ctx.audit)
    return ok({ resolved: true })
  },
)
