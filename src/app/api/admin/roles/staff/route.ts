import { adminWriteLimit } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { staffPermissionsSchema } from '@/schemas/admin-staff'
import { updateStaffPermissions } from '@/services/admin/staff.service'

/** Replace what the STAFF role may do (applies to every staff member on their next request). */
export const PUT = apiHandler(
  { auth: 'staff', permission: 'ADMIN_USERS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const { permissions } = await ctx.body(staffPermissionsSchema)
    return ok({ permissions: await updateStaffPermissions(permissions, ctx.audit) })
  },
)
