import { adminWriteLimit } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { created } from '@/lib/api/responses'
import { inviteStaffSchema } from '@/schemas/admin-staff'
import { inviteStaff } from '@/services/admin/staff.service'
import { processPendingEvents } from '@/services/events/process'

/** Create a staff or administrator account and email them a link to choose a password. */
export const POST = apiHandler(
  { auth: 'staff', permission: 'ADMIN_USERS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const user = await inviteStaff(await ctx.body(inviteStaffSchema), ctx.audit, {
      id: ctx.user.id,
      name: ctx.user.name,
    })
    ctx.afterResponse(() => processPendingEvents())
    return created({ user })
  },
)
