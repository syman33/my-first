import 'server-only'
import { prisma } from '@/db/client'
import { isUniqueViolation } from '@/db/errors'
import type { Locale } from '@/i18n/config'
import { AppError } from '@/lib/errors'
import { generateToken, hashToken, sealSecret } from '@/lib/security/tokens'
import { enqueueEvent } from '@/services/events/outbox.service'

function unsubscribeUrl(locale: Locale, token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  // Token in the fragment: never sent to servers or logged (see auth.service).
  return `${base}/${locale}/newsletter/unsubscribe#token=${token}`
}

/**
 * Subscribe an address. The response never reveals whether the address was
 * already subscribed. A welcome email (with a one-click unsubscribe link) is
 * queued only for new or returning subscribers, so repeats send nothing.
 */
export async function subscribeToNewsletter(input: {
  email: string
  locale: Locale
  source: string
}): Promise<{ queuedWelcome: boolean }> {
  const token = generateToken()
  const tokenHash = hashToken(token)
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.newsletterSubscriber.findUnique({
        where: { email: input.email },
        select: { id: true, status: true },
      })
      if (existing?.status === 'SUBSCRIBED') return { queuedWelcome: false }
      const subscriber = existing
        ? await tx.newsletterSubscriber.update({
            where: { id: existing.id },
            data: {
              status: 'SUBSCRIBED',
              locale: input.locale,
              source: input.source,
              unsubscribeTokenHash: tokenHash,
              subscribedAt: new Date(),
              unsubscribedAt: null,
            },
            select: { id: true },
          })
        : await tx.newsletterSubscriber.create({
            data: {
              email: input.email,
              locale: input.locale,
              source: input.source,
              unsubscribeTokenHash: tokenHash,
            },
            select: { id: true },
          })
      await enqueueEvent(tx, {
        type: 'NEWSLETTER_SUBSCRIBED',
        payload: {
          subscriberId: subscriber.id,
          sealedUnsubscribeUrl: sealSecret(unsubscribeUrl(input.locale, token)),
        },
        aggregateType: 'newsletter',
        aggregateId: subscriber.id,
      })
      return { queuedWelcome: true }
    })
  } catch (error) {
    // A concurrent request subscribed the same address first: same outcome.
    if (isUniqueViolation(error)) return { queuedWelcome: false }
    throw error
  }
}

/** One-click unsubscribe. Idempotent for a valid token; unknown tokens are rejected. */
export async function unsubscribeFromNewsletter(token: string): Promise<void> {
  const subscriber = await prisma.newsletterSubscriber.findUnique({
    where: { unsubscribeTokenHash: hashToken(token) },
    select: { id: true, status: true },
  })
  if (!subscriber) {
    throw new AppError('INVALID_OR_EXPIRED_TOKEN', 'Unknown unsubscribe token', { status: 400 })
  }
  if (subscriber.status === 'UNSUBSCRIBED') return
  await prisma.newsletterSubscriber.update({
    where: { id: subscriber.id },
    data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
  })
}
