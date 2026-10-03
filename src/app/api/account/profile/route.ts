import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { profileSchema } from '@/schemas/auth'
import { updateProfile } from '@/services/auth/auth.service'

export const GET = apiHandler({ auth: 'user' }, async (ctx) => {
  const { id, name, email, phone, locale, emailVerified } = ctx.user
  return ok({ profile: { id, name, email, phone, locale, emailVerified } })
})

export const PATCH = apiHandler({ auth: 'user' }, async (ctx) => {
  const input = await ctx.body(profileSchema)
  const profile = await updateProfile(ctx.user.id, input)
  return ok({ profile })
})
