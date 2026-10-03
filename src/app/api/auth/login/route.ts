import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { cookieNames } from '@/lib/auth/cookies'
import { setSessionCookie } from '@/lib/auth/session-cookie'
import { enforceRateLimits, RATE_LIMITS } from '@/lib/rate-limit'
import { loginSchema } from '@/schemas/auth'
import { authenticate } from '@/services/auth/auth.service'
import { createSession, invalidateSessionToken } from '@/services/auth/session.service'
import { mergeGuestState } from '@/services/cart/guest-merge'

export const POST = apiHandler(
  { auth: 'public', rateLimit: (ctx) => [{ rule: RATE_LIMITS.loginIp, subject: ctx.ip }] },
  async (ctx) => {
    const input = await ctx.body(loginSchema)
    await enforceRateLimits([{ rule: RATE_LIMITS.loginAccount, subject: input.email }])
    const user = await authenticate(input.email, input.password)

    // Session fixation defence: never reuse a pre-existing session id.
    await invalidateSessionToken(ctx.req.cookies.get(cookieNames.session)?.value)
    const session = await createSession(user, { ipAddress: ctx.ip, userAgent: ctx.userAgent })

    const response = ok({
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
    return response
  },
)
