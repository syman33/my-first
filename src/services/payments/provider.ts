import type { Locale } from '@/i18n/config'
import type { PaymentMethodCode } from '@/lib/pricing/order-totals'

/**
 * Payment provider abstraction (spec §37). The application never handles
 * card data: providers host the payment page, and the result reaches us
 * through a signed webhook or a server-to-server status check — never
 * through the customer's browser redirect alone.
 */

export type ProviderName = 'mock' | 'moyasar'

export interface CreatePaymentInput {
  paymentId: string
  orderId: string
  orderNumber: string
  /** Halalas */
  amount: number
  currency: 'SAR'
  method: PaymentMethodCode
  description: string
  /** Where the customer is sent back; it carries no proof of payment. */
  callbackUrl: string
  locale: Locale
}

export interface CreatePaymentResult {
  providerPaymentId: string
  redirectUrl: string
}

export type ProviderPaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED'

export interface ProviderPaymentState {
  providerPaymentId: string
  status: ProviderPaymentStatus
  /** Halalas, as reported by the provider. */
  amount: number
  currency: string
  /** Echoed metadata, used to cross-check the order. */
  orderId: string | null
  paymentId: string | null
  failureCode?: string | null
  failureMessage?: string | null
  rawStatus: string
}

export interface VerifiedWebhook {
  /** Provider's unique event id (deduplication key). */
  eventId: string
  type: string
  payment: ProviderPaymentState
}

export interface RefundResult {
  providerRefundId: string
  status: 'SUCCEEDED' | 'PENDING' | 'FAILED'
  failureMessage?: string
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebhookVerificationError'
  }
}

export interface PaymentProvider {
  readonly name: ProviderName
  /** True for providers that never move real money (development/testing). */
  readonly simulated: boolean
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>
  /** Authoritative status straight from the provider (server to server). */
  fetchPayment(providerPaymentId: string): Promise<ProviderPaymentState>
  refund(input: {
    providerPaymentId: string
    amount: number
    reason: string
  }): Promise<RefundResult>
  /** Authenticate and parse a webhook; throws WebhookVerificationError when it cannot be trusted. */
  verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedWebhook>
}
