import 'server-only'
import { createHmac } from 'node:crypto'
import { prisma } from '@/db/client'
import { env } from '@/lib/env'
import { generateToken, safeEqual } from '@/lib/security/tokens'
import {
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
  type ProviderPaymentState,
  type ProviderPaymentStatus,
  type RefundResult,
  type VerifiedWebhook,
  WebhookVerificationError,
} from './provider'

/**
 * DEVELOPMENT/TEST ONLY payment provider (spec §38). No money moves. Its
 * "hosted payment page" is /[locale]/payment/mock/[id], where a developer
 * chooses SUCCESS, FAILED or CANCELLED; the outcome is then delivered as a
 * signed webhook exactly like a real provider would. The storefront shows a
 * test-mode banner whenever this provider is active, and production refuses
 * it unless explicitly allowed for a private demo.
 */

export const MOCK_SIGNATURE_HEADER = 'x-velora-mock-signature'
const TOLERANCE_SECONDS = 300

export interface MockWebhookPayload {
  id: string
  type: 'payment.paid' | 'payment.failed' | 'payment.cancelled'
  created: number
  data: {
    id: string
    status: 'paid' | 'failed' | 'cancelled'
    amount: number
    currency: string
    metadata: { order_id: string | null; payment_id: string | null }
    failure_code?: string | null
    failure_message?: string | null
  }
}

function secret(): string {
  const value = env().MOCK_PAYMENT_WEBHOOK_SECRET
  if (!value) throw new WebhookVerificationError('Mock webhook secret is not configured')
  return value
}

/** `t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>` — timestamped to stop replays. */
export function signMockWebhook(
  rawBody: string,
  timestamp = Math.floor(Date.now() / 1000),
  key = secret(),
): string {
  const digest = createHmac('sha256', key).update(`${timestamp}.${rawBody}`).digest('hex')
  return `t=${timestamp},v1=${digest}`
}

const STATUS: Record<string, ProviderPaymentStatus> = {
  paid: 'PAID',
  failed: 'FAILED',
  cancelled: 'CANCELLED',
  initiated: 'PENDING',
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock' as const
  readonly simulated = true

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const providerPaymentId = `mock_${generateToken().slice(0, 24)}`
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
    return {
      providerPaymentId,
      redirectUrl: `${base}/${input.locale}/payment/mock/${providerPaymentId}`,
    }
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPaymentState> {
    const payment = await prisma.payment.findUnique({
      where: { provider_providerPaymentId: { provider: 'mock', providerPaymentId } },
      select: { id: true, orderId: true, amount: true, currency: true, providerStatus: true },
    })
    if (!payment) throw new WebhookVerificationError('Unknown mock payment')
    const raw = payment.providerStatus ?? 'initiated'
    return {
      providerPaymentId,
      status: STATUS[raw] ?? 'PENDING',
      amount: payment.amount,
      currency: payment.currency,
      orderId: payment.orderId,
      paymentId: payment.id,
      rawStatus: raw,
    }
  }

  async refund(): Promise<RefundResult> {
    return { providerRefundId: `mock_rf_${generateToken().slice(0, 20)}`, status: 'SUCCEEDED' }
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedWebhook> {
    const header = headers.get(MOCK_SIGNATURE_HEADER) ?? ''
    const parts = Object.fromEntries(
      header.split(',').map((part) => part.trim().split('=', 2) as [string, string]),
    )
    const timestamp = Number(parts.t)
    if (!parts.v1 || !Number.isInteger(timestamp))
      throw new WebhookVerificationError('Missing signature')
    if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > TOLERANCE_SECONDS) {
      throw new WebhookVerificationError('Signature timestamp outside tolerance (replay?)')
    }
    const expected = signMockWebhook(rawBody, timestamp).split('v1=')[1] ?? ''
    if (!safeEqual(parts.v1, expected)) throw new WebhookVerificationError('Invalid signature')

    let payload: MockWebhookPayload
    try {
      payload = JSON.parse(rawBody) as MockWebhookPayload
    } catch {
      throw new WebhookVerificationError('Malformed payload')
    }
    if (!payload?.id || !payload.data?.id) throw new WebhookVerificationError('Malformed payload')
    return {
      eventId: payload.id,
      type: payload.type,
      payment: {
        providerPaymentId: payload.data.id,
        status: STATUS[payload.data.status] ?? 'PENDING',
        amount: payload.data.amount,
        currency: payload.data.currency,
        orderId: payload.data.metadata?.order_id ?? null,
        paymentId: payload.data.metadata?.payment_id ?? null,
        failureCode: payload.data.failure_code ?? null,
        failureMessage: payload.data.failure_message ?? null,
        rawStatus: payload.data.status,
      },
    }
  }
}
