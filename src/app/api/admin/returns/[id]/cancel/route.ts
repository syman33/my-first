import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { returnDecisionSchema } from '@/schemas/returns'
import { cancelReturn } from '@/services/orders/returns.service'

/** Close an approved return whose parcel never arrived. */
export const POST = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'ORDERS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id)
    const { note } = await ctx.body(returnDecisionSchema)
    await cancelReturn(id, { audit: ctx.audit, note })
    return ok({ status: 'CANCELLED' })
  },
)
