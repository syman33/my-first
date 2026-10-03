import 'server-only'
import { prisma } from '@/db/client'
import { unsealSecret } from '@/lib/security/tokens'
import { registerOutboxHandler } from '@/services/events/outbox.service'
import { localeOf, sendNotification } from './notification.service'
import {
  passwordChangedEmail,
  passwordResetEmail,
  verifyEmailEmail,
  welcomeEmail,
} from './templates/auth'

function appUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  return `${base}${path}`
}

async function loadUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, locale: true, status: true },
  })
}

let registered = false

/** Registers account-related notification handlers (idempotent). */
export function registerAccountNotificationHandlers(): void {
  if (registered) return
  registered = true

  registerOutboxHandler('USER_REGISTERED', async (event) => {
    const user = await loadUser(event.payload.userId)
    if (!user) return
    const locale = localeOf(event.payload.locale)
    await sendNotification({
      outboxEventId: event.id,
      userId: user.id,
      channel: 'EMAIL',
      template: 'welcome',
      locale,
      recipient: user.email,
      data: { name: user.name },
      render: () => welcomeEmail(locale, { name: user.name, shopUrl: appUrl(`/${locale}/shop`) }),
    })
  })

  registerOutboxHandler('EMAIL_VERIFICATION_REQUESTED', async (event) => {
    const user = await loadUser(event.payload.userId)
    if (!user) return
    const locale = localeOf(event.payload.locale)
    await sendNotification({
      outboxEventId: event.id,
      userId: user.id,
      channel: 'EMAIL',
      template: 'verify-email',
      locale,
      recipient: user.email,
      data: { name: user.name },
      render: () =>
        verifyEmailEmail(locale, {
          name: user.name,
          verifyUrl: unsealSecret(event.payload.sealedVerifyUrl),
        }),
    })
  })

  registerOutboxHandler('PASSWORD_RESET_REQUESTED', async (event) => {
    const user = await loadUser(event.payload.userId)
    if (!user || user.status !== 'ACTIVE') return
    const locale = localeOf(event.payload.locale)
    await sendNotification({
      outboxEventId: event.id,
      userId: user.id,
      channel: 'EMAIL',
      template: 'password-reset',
      locale,
      recipient: user.email,
      data: { name: user.name },
      render: () =>
        passwordResetEmail(locale, {
          name: user.name,
          resetUrl: unsealSecret(event.payload.sealedResetUrl),
        }),
    })
  })

  registerOutboxHandler('PASSWORD_CHANGED', async (event) => {
    const user = await loadUser(event.payload.userId)
    if (!user) return
    const locale = localeOf(event.payload.locale)
    await sendNotification({
      outboxEventId: event.id,
      userId: user.id,
      channel: 'EMAIL',
      template: 'password-changed',
      locale,
      recipient: user.email,
      data: { name: user.name },
      render: () => passwordChangedEmail(locale, { name: user.name }),
    })
  })
}

export { appUrl }
