import { apiHandler } from '@/lib/api/handler'
import { created } from '@/lib/api/responses'
import { cookieNames } from '@/lib/auth/cookies'
import { setSessionCookie } from '@/lib/auth/session-cookie'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { registerSchema } from '@/schemas/auth'
import { registerCustomer } from '@/services/auth/auth.service'
import { createSession, invalidateSessionToken } from '@/services/auth/session.service'
import { mergeGuestState } from '@/services/cart/guest-merge'
import { processPendingEvents } from '@/services/events/process'

export const POST = apiHandler(
  { auth: 'public', rateLimit: (ctx) => [{ rule: RATE_LIMITS.register, subject: ctx.ip }] },
  async (ctx) => {
    const input = await ctx.body(registerSchema)
    const user = await registerCustomer({
      name: input.name,
      email: input.email,
      phone: input.phone,
      password: input.password,
      locale: input.locale,
    })
    await invalidateSessionToken(ctx.req.cookies.get(cookieNames.session)?.value)
    const session = await createSession(user, { ipAddress: ctx.ip, userAgent: ctx.userAgent })
    const response = created({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        locale: user.locale,
      },
    })
    setSessionCookie(response, session.token, session.cookieMaxAgeSeconds)
    await mergeGuestState(ctx.req, response, user.id)
    ctx.afterResponse(() => processPendingEvents())
    return response
  },
)
