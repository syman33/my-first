import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { returnReceiptSchema } from '@/schemas/returns'
import { receiveReturn } from '@/services/orders/returns.service'

/** Record inspection of the returned parcel; sellable units go back into stock. */
export const POST = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'ORDERS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id)
    const input = await ctx.body(returnReceiptSchema)
    await receiveReturn(id, input, ctx.audit)
    return ok({ status: 'RECEIVED' })
  },
)
