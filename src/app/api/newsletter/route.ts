import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { enforceRateLimits, RATE_LIMITS } from '@/lib/rate-limit'
import { newsletterSubscribeSchema } from '@/schemas/engagement'
import { subscribeToNewsletter } from '@/services/engagement/newsletter.service'
import { processPendingEvents } from '@/services/events/process'

/** Always answers the same way, so it cannot be used to test which addresses are subscribed. */
export const POST = apiHandler(
  { auth: 'public', rateLimit: (ctx) => [{ rule: RATE_LIMITS.newsletter, subject: ctx.ip }] },
  async (ctx) => {
    const input = await ctx.body(newsletterSubscribeSchema)
    await enforceRateLimits([{ rule: RATE_LIMITS.newsletterEmail, subject: input.email }])
    const result = await subscribeToNewsletter(input)
    if (result.queuedWelcome) ctx.afterResponse(() => processPendingEvents())
    return ok({ subscribed: true })
  },
)
