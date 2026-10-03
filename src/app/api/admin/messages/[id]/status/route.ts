import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { messageStatusSchema } from '@/schemas/admin-people'
import { setMessageStatus } from '@/services/admin/customers.service'

export const POST = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'MESSAGES_VIEW', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id)
    const { status } = await ctx.body(messageStatusSchema)
    await setMessageStatus(id, status, ctx.audit)
    return ok({ status })
  },
)
