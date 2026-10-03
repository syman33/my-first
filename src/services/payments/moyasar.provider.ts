import 'server-only'
import { env } from '@/lib/env'
import { ProviderNotConfiguredError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { safeEqual } from '@/lib/security/tokens'
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
 * Moyasar (https://moyasar.com) via its hosted Invoices page: customers pay
 * with mada, Visa/Mastercard, Apple Pay or STC Pay on Moyasar's page, so card
 * data never reaches this application.
 *
 * Status: CODE-READY. It is written against Moyasar's documented REST API
 * but has not been exercised against a live Moyasar account in this
 * repository. Before launch: configure keys, register the webhook URL
 * (/api/webhooks/payments/moyasar) with the shared secret, and run the
 * payment test matrix against Moyasar's test mode.
 */

const API = 'https://api.moyasar.com/v1'

interface MoyasarPayment {
  id: string
  status: string
  amount: number
  currency: string
  invoice_id?: string | null
  metadata?: Record<string, string> | null
  source?: { message?: string | null } | null
}

interface MoyasarInvoice {
  id: string
  status: string
  amount: number
  currency: string
  url: string
  metadata?: Record<string, string> | null
  payments?: MoyasarPayment[]
}

interface MoyasarWebhook {
  id: string
  type: string
  secret_token?: string
  data: MoyasarPayment
}

/** Map Moyasar invoice statuses to ours; unknown statuses stay pending (never "paid" by accident). */
export function mapMoyasarInvoiceStatus(status: string): ProviderPaymentStatus {
  switch (status) {
    case 'paid':
      return 'PAID'
    case 'failed':
      return 'FAILED'
    case 'canceled':
    case 'cancelled':
    case 'expired':
      return 'CANCELLED'
    default:
      return 'PENDING'
  }
}

export function invoiceToState(invoice: MoyasarInvoice): ProviderPaymentState {
  const lastPayment = invoice.payments?.at(-1)
  return {
    providerPaymentId: invoice.id,
    status: mapMoyasarInvoiceStatus(invoice.status),
    amount: invoice.amount,
    currency: invoice.currency,
    orderId: invoice.metadata?.order_id ?? null,
    paymentId: invoice.metadata?.payment_id ?? null,
    failureCode: lastPayment && lastPayment.status !== 'paid' ? lastPayment.status : null,
    failureMessage: lastPayment?.source?.message ?? null,
    rawStatus: invoice.status,
  }
}

export class MoyasarPaymentProvider implements PaymentProvider {
  readonly name = 'moyasar' as const
  readonly simulated = false

  private config() {
    const { MOYASAR_SECRET_KEY, MOYASAR_WEBHOOK_SECRET } = env()
    if (!MOYASAR_SECRET_KEY || !MOYASAR_WEBHOOK_SECRET) {
      throw new ProviderNotConfiguredError('moyasar', [
        ...(MOYASAR_SECRET_KEY ? [] : ['MOYASAR_SECRET_KEY']),
        ...(MOYASAR_WEBHOOK_SECRET ? [] : ['MOYASAR_WEBHOOK_SECRET']),
      ])
    }
    return { secretKey: MOYASAR_SECRET_KEY, webhookSecret: MOYASAR_WEBHOOK_SECRET }
  }

  private async request<T>(
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const { secretKey } = this.config()
    const response = await fetch(`${API}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      logger.error('payments.moyasar_error', {
        path,
        status: response.status,
        detail: detail.slice(0, 500),
      })
      throw new Error(`Moyasar request failed (${response.status})`)
    }
    return (await response.json()) as T
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const invoice = await this.request<MoyasarInvoice>('/invoices', {
      method: 'POST',
      body: {
        amount: input.amount,
        currency: input.currency,
        description: input.description,
        callback_url: input.callbackUrl,
        metadata: {
          order_id: input.orderId,
          payment_id: input.paymentId,
          order_number: input.orderNumber,
        },
      },
    })
    return { providerPaymentId: invoice.id, redirectUrl: invoice.url }
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPaymentState> {
    return invoiceToState(
      await this.request<MoyasarInvoice>(`/invoices/${encodeURIComponent(providerPaymentId)}`),
    )
  }

  async refund(input: { providerPaymentId: string; amount: number }): Promise<RefundResult> {
    const invoice = await this.request<MoyasarInvoice>(
      `/invoices/${encodeURIComponent(input.providerPaymentId)}`,
    )
    const paid = invoice.payments?.find((payment) => payment.status === 'paid')
    if (!paid)
      return {
        providerRefundId: '',
        status: 'FAILED',
        failureMessage: 'No captured payment on this invoice',
      }
    const refunded = await this.request<MoyasarPayment>(
      `/payments/${encodeURIComponent(paid.id)}/refund`,
      {
        method: 'POST',
        body: { amount: input.amount },
      },
    )
    return {
      providerRefundId: refunded.id,
      status: refunded.status === 'refunded' ? 'SUCCEEDED' : 'PENDING',
    }
  }

  async verifyWebhook(rawBody: string): Promise<VerifiedWebhook> {
    const { webhookSecret } = this.config()
    let payload: MoyasarWebhook
    try {
      payload = JSON.parse(rawBody) as MoyasarWebhook
    } catch {
      throw new WebhookVerificationError('Malformed payload')
    }
    if (!payload.secret_token || !safeEqual(payload.secret_token, webhookSecret)) {
      throw new WebhookVerificationError('Invalid secret token')
    }
    const invoiceId = payload.data?.invoice_id
    if (!payload.id || !invoiceId) throw new WebhookVerificationError('Malformed payload')
    // Defence in depth: trust the provider's API, not just the notification body.
    const state = await this.fetchPayment(invoiceId)
    return { eventId: payload.id, type: payload.type, payment: state }
  }
}
