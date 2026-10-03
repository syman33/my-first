import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { clearSessionCookie } from '@/lib/auth/session-cookie'
import { invalidateSessionToken } from '@/services/auth/session.service'

/** POST only (CSRF-checked): a cross-site image/link cannot log a user out. */
export const POST = apiHandler({ auth: 'optional' }, async (ctx) => {
  await invalidateSessionToken(ctx.sessionToken)
  const response = ok({ loggedOut: true })
  clearSessionCookie(response)
  return response
})
