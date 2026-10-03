import 'server-only'
import { prisma } from '@/db/client'
import type { NotificationChannel } from '@/generated/prisma/enums'
import { type Prisma } from '@/generated/prisma/client'
import { isLocale, type Locale } from '@/i18n/config'
import { logger } from '@/lib/logger'
import { emitAlert } from '@/lib/monitoring'
import { type DeliveryResult, getEmailProvider, getSmsProvider } from './providers'
import type { RenderedEmail } from './templates/layout'

/**
 * Sends one notification idempotently. A Notification row is keyed by
 * (outbox event, channel, template): a retried or replayed event can never
 * send the same message twice once it has been SENT or SKIPPED.
 *
 * `data` is stored for the admin notification log — it must contain only
 * non-sensitive values (order numbers, names). Links with tokens are passed
 * separately via `render` and never persisted.
 */
export interface NotificationRequest {
  outboxEventId: string | null
  userId: string | null
  channel: NotificationChannel
  template: string
  locale: Locale
  recipient: string
  data: Record<string, string | number | null>
  render: () => RenderedEmail | { text: string }
}

export async function sendNotification(
  request: NotificationRequest,
): Promise<DeliveryResult['status']> {
  const existing = request.outboxEventId
    ? await prisma.notification.findUnique({
        where: {
          outboxEventId_channel_template: {
            outboxEventId: request.outboxEventId,
            channel: request.channel,
            template: request.template,
          },
        },
      })
    : null
  if (existing && (existing.status === 'SENT' || existing.status === 'SKIPPED'))
    return existing.status

  const rendered = request.render()
  const subject = 'subject' in rendered ? rendered.subject : null
  const provider =
    request.channel === 'EMAIL'
      ? getEmailProvider()
      : getSmsProvider(request.channel === 'SMS' ? 'sms' : 'whatsapp')

  const notification =
    existing ??
    (await prisma.notification.create({
      data: {
        outboxEventId: request.outboxEventId,
        userId: request.userId,
        channel: request.channel,
        template: request.template,
        locale: request.locale,
        recipient: request.recipient,
        subject,
        data: request.data as Prisma.InputJsonValue,
        status: 'PENDING',
        provider: provider?.name ?? 'none',
      },
    }))

  if (!provider) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'SKIPPED',
        error: `${request.channel} channel disabled`,
        attempts: { increment: 1 },
      },
    })
    return 'SKIPPED'
  }

  let result: DeliveryResult
  try {
    result =
      request.channel === 'EMAIL'
        ? await getEmailProvider().send({
            to: request.recipient,
            tag: request.template,
            ...(rendered as RenderedEmail),
          })
        : await (provider as NonNullable<ReturnType<typeof getSmsProvider>>).send({
            to: request.recipient,
            text: rendered.text,
          })
  } catch (error) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'FAILED',
        error: error instanceof Error ? error.message.slice(0, 1000) : 'unknown',
        attempts: { increment: 1 },
      },
    })
    throw error // transient: let the outbox retry
  }

  await prisma.notification.update({
    where: { id: notification.id },
    data: {
      status: result.status,
      provider: result.provider,
      providerMessageId: result.status === 'SENT' ? result.providerMessageId : null,
      error: result.status === 'SENT' ? null : result.reason.slice(0, 1000),
      sentAt: result.status === 'SENT' ? new Date() : null,
      attempts: { increment: 1 },
    },
  })
  if (result.status === 'FAILED') {
    emitAlert('notification.delivery_failed', {
      template: request.template,
      channel: request.channel,
      reason: result.reason,
    })
  } else {
    logger.debug('notification.delivered', { template: request.template, status: result.status })
  }
  return result.status
}

export function localeOf(value: string | null | undefined): Locale {
  return isLocale(value) ? value : 'ar'
}
