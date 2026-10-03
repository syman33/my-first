import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'

/** Current user (safe DTO — never includes password hashes or session ids). */
export const GET = apiHandler({ auth: 'optional' }, async (ctx) => {
  if (!ctx.user) return ok({ user: null })
  const { id, name, email, role, locale, emailVerified } = ctx.user
  return ok({ user: { id, name, email, role, locale, emailVerified } })
})
