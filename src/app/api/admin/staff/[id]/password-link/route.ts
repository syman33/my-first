import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { sendStaffPasswordLink } from '@/services/admin/staff.service'
import { processPendingEvents } from '@/services/events/process'

/** Email a staff member a fresh invitation (never signed in) or a password-reset link. */
export const POST = apiHandler<{ id: string }>(
  {
    auth: 'staff',
    permission: 'ADMIN_USERS_MANAGE',
    rateLimit: (ctx) => [
      ...adminWriteLimit(ctx),
      // At most a few emails per account per hour, whoever asks.
      { rule: RATE_LIMITS.forgotPasswordAccount, subject: `staff:${ctx.req.nextUrl.pathname}` },
    ],
  },
  async (ctx) => {
    const id = routeId(ctx.params.id)
    const result = await sendStaffPasswordLink(id, ctx.audit, {
      id: ctx.user.id,
      name: ctx.user.name,
    })
    ctx.afterResponse(() => processPendingEvents())
    return ok(result)
  },
)
