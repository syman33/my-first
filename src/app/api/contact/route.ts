import { apiHandler } from '@/lib/api/handler'
import { created } from '@/lib/api/responses'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { contactMessageSchema } from '@/schemas/engagement'
import { createContactMessage } from '@/services/engagement/contact.service'
import { processPendingEvents } from '@/services/events/process'

export const POST = apiHandler(
  { auth: 'optional', rateLimit: (ctx) => [{ rule: RATE_LIMITS.contact, subject: ctx.ip }] },
  async (ctx) => {
    const input = await ctx.body(contactMessageSchema)
    const message = await createContactMessage({ ...input, userId: ctx.user?.id ?? null })
    ctx.afterResponse(() => processPendingEvents())
    return created({ id: message.id })
  },
)
