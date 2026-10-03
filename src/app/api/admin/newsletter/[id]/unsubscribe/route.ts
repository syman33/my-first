import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { unsubscribeByStaff } from '@/services/admin/customers.service'

/** Honour an unsubscribe request received another way (e.g. by email). */
export const POST = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'NEWSLETTER_VIEW', rateLimit: adminWriteLimit },
  async (ctx) => {
    await unsubscribeByStaff(routeId(ctx.params.id), ctx.audit)
    return ok({ status: 'UNSUBSCRIBED' })
  },
)
