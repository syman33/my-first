import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { updateStaffSchema } from '@/schemas/admin-staff'
import { updateStaffMember } from '@/services/admin/staff.service'

/** Change a back-office account's role or suspend/reactivate it. */
export const PATCH = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'ADMIN_USERS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id)
    await updateStaffMember(id, await ctx.body(updateStaffSchema), ctx.audit, {
      id: ctx.user.id,
      name: ctx.user.name,
    })
    return ok({ updated: true })
  },
)
