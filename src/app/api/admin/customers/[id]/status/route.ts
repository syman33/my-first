import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { customerStatusSchema } from '@/schemas/admin-people'
import { setCustomerStatus } from '@/services/admin/customers.service'

/** Suspend (signs the customer out everywhere) or reactivate an account, with a reason. */
export const POST = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'CUSTOMERS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id)
    const { status, reason } = await ctx.body(customerStatusSchema)
    await setCustomerStatus(id, status, reason, ctx.audit)
    return ok({ status })
  },
)
