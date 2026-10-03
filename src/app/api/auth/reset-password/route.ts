import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { clearSessionCookie } from '@/lib/auth/session-cookie'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { resetPasswordSchema } from '@/schemas/auth'
import { resetPassword } from '@/services/auth/auth.service'
import { processPendingEvents } from '@/services/events/process'

export const POST = apiHandler(
  { auth: 'public', rateLimit: (ctx) => [{ rule: RATE_LIMITS.resetPassword, subject: ctx.ip }] },
  async (ctx) => {
    const input = await ctx.body(resetPasswordSchema)
    await resetPassword(input.token, input.password)
    // Every session was revoked; make sure this browser does not keep a dead cookie.
    const response = ok({ passwordReset: true })
    clearSessionCookie(response)
    ctx.afterResponse(() => processPendingEvents())
    return response
  },
)
