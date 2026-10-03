import 'server-only'
import { prisma } from '@/db/client'
import { unsealSecret } from '@/lib/security/tokens'
import { registerOutboxHandler } from '@/services/events/outbox.service'
import { getSettings } from '@/services/settings/settings.service'
import { localeOf, sendNotification } from './notification.service'
import { contactStaffEmail, newsletterWelcomeEmail } from './templates/engagement'

function appUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  return `${base}${path}`
}

let registered = false

/** Newsletter and contact-form notifications (idempotent registration). */
export function registerEngagementNotificationHandlers(): void {
  if (registered) return
  registered = true

  registerOutboxHandler('NEWSLETTER_SUBSCRIBED', async (event) => {
    const subscriber = await prisma.newsletterSubscriber.findUnique({
      where: { id: event.payload.subscriberId },
      select: { email: true, locale: true, status: true },
    })
    // Unsubscribed before the welcome went out: send nothing.
    if (!subscriber || subscriber.status !== 'SUBSCRIBED') return
    const locale = localeOf(subscriber.locale)
    const unsubscribeUrl = unsealSecret(event.payload.sealedUnsubscribeUrl)
    await sendNotification({
      outboxEventId: event.id,
      userId: null,
      channel: 'EMAIL',
      template: 'newsletter-welcome',
      locale,
      recipient: subscriber.email,
      data: {},
      render: () =>
        newsletterWelcomeEmail(locale, { shopUrl: appUrl(`/${locale}/shop`), unsubscribeUrl }),
    })
  })

  registerOutboxHandler('CONTACT_MESSAGE_RECEIVED', async (event) => {
    const message = await prisma.contactMessage.findUnique({
      where: { id: event.payload.contactMessageId },
    })
    if (!message) return
    const store = await getSettings('store')
    await sendNotification({
      outboxEventId: event.id,
      userId: null,
      channel: 'EMAIL',
      template: 'contact-staff',
      locale: 'ar',
      recipient: store.email,
      data: { subject: message.subject },
      render: () =>
        contactStaffEmail({
          name: message.name,
          email: message.email,
          phone: message.phone,
          subject: message.subject,
          message: message.message,
          adminUrl: appUrl(`/admin/messages/${message.id}`),
        }),
    })
  })
}
