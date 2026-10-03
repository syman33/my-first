import 'server-only'
import { prisma } from '@/db/client'
import type { Locale } from '@/i18n/config'
import { AppError, OrderNotFoundError } from '@/lib/errors'
import { env } from '@/lib/env'
import { generateToken } from '@/lib/security/tokens'
import { MOCK_SIGNATURE_HEADER, type MockWebhookPayload, signMockWebhook } from './mock.provider'
import { handlePaymentWebhook } from './payment.service'

export type MockOutcome = 'SUCCESS' | 'FAILED' | 'CANCELLED'

/** Payment shown on the mock "provider page" (owner only, mock provider only). */
export async function getMockPayment(providerPaymentId: string, userId: string) {
  if (env().PAYMENT_PROVIDER !== 'mock') return null
  return prisma.payment.findFirst({
    where: { provider: 'mock', providerPaymentId, order: { userId } },
    select: {
      id: true,
      amount: true,
      currency: true,
      status: true,
      order: { select: { id: true, orderNumber: true } },
    },
  })
}

/**
 * Plays the provider's part: records the outcome and delivers it as a signed
 * webhook through the same verification and processing path as production.
 */
export async function simulateMockPayment(
  providerPaymentId: string,
  outcome: MockOutcome,
  userId: string,
  locale: Locale,
): Promise<{ redirectUrl: string }> {
  const payment = await getMockPayment(providerPaymentId, userId)
  if (!payment) throw new OrderNotFoundError()
  if (payment.status !== 'PENDING') {
    throw new AppError('PAYMENT_ALREADY_COMPLETED', 'This payment is no longer pending', {
      status: 409,
    })
  }
  const status = outcome === 'SUCCESS' ? 'paid' : outcome === 'FAILED' ? 'failed' : 'cancelled'
  await prisma.payment.update({ where: { id: payment.id }, data: { providerStatus: status } })

  const payload: MockWebhookPayload = {
    id: `evt_${generateToken().slice(0, 24)}`,
    type: `payment.${status}`,
    created: Math.floor(Date.now() / 1000),
    data: {
      id: providerPaymentId,
      status,
      amount: payment.amount,
      currency: payment.currency,
      metadata: { order_id: payment.order.id, payment_id: payment.id },
      ...(outcome === 'FAILED'
        ? { failure_code: 'card_declined', failure_message: 'Simulated decline' }
        : {}),
    },
  }
  const raw = JSON.stringify(payload)
  await handlePaymentWebhook(
    'mock',
    raw,
    new Headers({ [MOCK_SIGNATURE_HEADER]: signMockWebhook(raw) }),
  )
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  return { redirectUrl: `${base}/${locale}/checkout/return?payment=${payment.id}` }
}
