import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { verifyEmailSchema } from '@/schemas/auth'
import { verifyEmail } from '@/services/auth/auth.service'

export const POST = apiHandler(
  { auth: 'public', rateLimit: (ctx) => [{ rule: RATE_LIMITS.verifyEmail, subject: ctx.ip }] },
  async (ctx) => {
    const input = await ctx.body(verifyEmailSchema)
    await verifyEmail(input.token)
    return ok({ verified: true })
  },
)
