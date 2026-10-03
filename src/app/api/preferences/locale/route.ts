import { z } from 'zod'
import { LOCALE_COOKIE } from '@/i18n/config'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { cookiesAreSecure } from '@/lib/auth/cookies'

const schema = z.object({ locale: z.enum(['ar', 'en']) })

/** Remember the interface language (used by the back office, which has no locale in its URLs). */
export const POST = apiHandler({ auth: 'public' }, async (ctx) => {
  const { locale } = await ctx.body(schema)
  const response = ok({ locale })
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
    sameSite: 'lax',
    secure: cookiesAreSecure(),
  })
  return response
})
