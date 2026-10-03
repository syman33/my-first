import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { enforceRateLimits, RATE_LIMITS } from '@/lib/rate-limit'
import { forgotPasswordSchema } from '@/schemas/auth'
import { requestPasswordReset } from '@/services/auth/auth.service'
import { processPendingEvents } from '@/services/events/process'

/** Always answers the same way so the endpoint cannot be used to discover accounts. */
export const POST = apiHandler(
  { auth: 'public', rateLimit: (ctx) => [{ rule: RATE_LIMITS.forgotPasswordIp, subject: ctx.ip }] },
  async (ctx) => {
    const input = await ctx.body(forgotPasswordSchema)
    await enforceRateLimits([{ rule: RATE_LIMITS.forgotPasswordAccount, subject: input.email }])
    await requestPasswordReset(input.email, input.locale)
    ctx.afterResponse(() => processPendingEvents())
    return ok({ accepted: true })
  },
)
