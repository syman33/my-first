import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { changePasswordSchema } from '@/schemas/auth'
import { changePassword } from '@/services/auth/auth.service'
import { processPendingEvents } from '@/services/events/process'

/** Changing the password signs out every other device; the current session stays. */
export const POST = apiHandler(
  {
    auth: 'user',
    rateLimit: (ctx) => [{ rule: RATE_LIMITS.changePassword, subject: ctx.user?.id ?? ctx.ip }],
  },
  async (ctx) => {
    const input = await ctx.body(changePasswordSchema)
    await changePassword({
      userId: ctx.user.id,
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      keepSessionId: ctx.session.sessionId,
    })
    ctx.afterResponse(() => processPendingEvents())
    return ok({ changed: true })
  },
)
