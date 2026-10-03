import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { resendEmailVerification } from '@/services/auth/auth.service'
import { processPendingEvents } from '@/services/events/process'

export const POST = apiHandler(
  {
    auth: 'user',
    rateLimit: (ctx) => [{ rule: RATE_LIMITS.resendVerification, subject: ctx.user?.id ?? ctx.ip }],
  },
  async (ctx) => {
    const result = await resendEmailVerification(ctx.user.id, ctx.locale)
    if (!result.alreadyVerified) ctx.afterResponse(() => processPendingEvents())
    return ok(result)
  },
)
