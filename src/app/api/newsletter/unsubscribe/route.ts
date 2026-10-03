import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { newsletterUnsubscribeSchema } from '@/schemas/engagement'
import { unsubscribeFromNewsletter } from '@/services/engagement/newsletter.service'

export const POST = apiHandler(
  { auth: 'public', rateLimit: (ctx) => [{ rule: RATE_LIMITS.newsletter, subject: ctx.ip }] },
  async (ctx) => {
    const { token } = await ctx.body(newsletterUnsubscribeSchema)
    await unsubscribeFromNewsletter(token)
    return ok({ unsubscribed: true })
  },
)
