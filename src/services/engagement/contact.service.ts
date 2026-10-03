import 'server-only'
import { prisma } from '@/db/client'
import type { Locale } from '@/i18n/config'
import { enqueueEvent } from '@/services/events/outbox.service'

/** Store a contact-form message and queue a notification to customer care. */
export async function createContactMessage(input: {
  name: string
  email: string
  phone: string | null
  subject: string
  message: string
  locale: Locale
  userId: string | null
}): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const message = await tx.contactMessage.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        subject: input.subject,
        message: input.message,
        locale: input.locale,
        userId: input.userId,
      },
      select: { id: true },
    })
    await enqueueEvent(tx, {
      type: 'CONTACT_MESSAGE_RECEIVED',
      payload: { contactMessageId: message.id },
      aggregateType: 'contact',
      aggregateId: message.id,
    })
    return message
  })
}
