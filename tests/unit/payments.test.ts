import { describe, expect, it } from 'vitest'
import {
  IDEMPOTENCY_SCOPE_MAX_LENGTH,
  requestFingerprint,
  withIdempotency,
} from '@/lib/idempotency'
import {
  MOCK_SIGNATURE_HEADER,
  MockPaymentProvider,
  signMockWebhook,
} from '@/services/payments/mock.provider'
import { invoiceToState, mapMoyasarInvoiceStatus } from '@/services/payments/moyasar.provider'
import { WebhookVerificationError } from '@/services/payments/provider'

// The test environment configures the mock provider's webhook secret (tests/support/test-env.ts).
const SECRET = process.env.MOCK_PAYMENT_WEBHOOK_SECRET ?? ''

function payload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: 'evt_1',
    type: 'payment.paid',
    created: 1,
    data: {
      id: 'mock_abc',
      status: 'paid',
      amount: 1000,
      currency: 'SAR',
      metadata: { order_id: 'o1', payment_id: 'p1' },
    },
    ...overrides,
  })
}

describe('mock provider webhooks', () => {
  const provider = new MockPaymentProvider()

  it('accepts a correctly signed, fresh webhook', async () => {
    const body = payload()
    const verified = await provider.verifyWebhook(
      body,
      new Headers({ [MOCK_SIGNATURE_HEADER]: signMockWebhook(body, undefined, SECRET) }),
    )
    expect(verified).toMatchObject({
      eventId: 'evt_1',
      payment: { status: 'PAID', amount: 1000, orderId: 'o1', paymentId: 'p1' },
    })
  })

  it('rejects tampered bodies, wrong secrets, missing and stale signatures', async () => {
    const body = payload()
    const signature = signMockWebhook(body, undefined, SECRET)
    const tampered = body.replace('"amount":1000', '"amount":1')
    await expect(
      provider.verifyWebhook(tampered, new Headers({ [MOCK_SIGNATURE_HEADER]: signature })),
    ).rejects.toBeInstanceOf(WebhookVerificationError)
    const forged = signMockWebhook(body, undefined, 'another-secret-another-secret-123')
    await expect(
      provider.verifyWebhook(body, new Headers({ [MOCK_SIGNATURE_HEADER]: forged })),
    ).rejects.toBeInstanceOf(WebhookVerificationError)
    await expect(provider.verifyWebhook(body, new Headers())).rejects.toBeInstanceOf(
      WebhookVerificationError,
    )
    const stale = signMockWebhook(body, Math.floor(Date.now() / 1000) - 3600, SECRET)
    await expect(
      provider.verifyWebhook(body, new Headers({ [MOCK_SIGNATURE_HEADER]: stale })),
    ).rejects.toThrow(/tolerance/)
  })
})

describe('Moyasar mapping', () => {
  it('maps statuses conservatively', () => {
    expect(mapMoyasarInvoiceStatus('paid')).toBe('PAID')
    expect(mapMoyasarInvoiceStatus('failed')).toBe('FAILED')
    expect(mapMoyasarInvoiceStatus('expired')).toBe('CANCELLED')
    expect(mapMoyasarInvoiceStatus('initiated')).toBe('PENDING')
    expect(mapMoyasarInvoiceStatus('something-new')).toBe('PENDING')
  })

  it('reads amount, currency and echoed metadata from an invoice', () => {
    expect(
      invoiceToState({
        id: 'inv_1',
        status: 'paid',
        amount: 29_900,
        currency: 'SAR',
        url: 'https://checkout.moyasar.com/invoices/inv_1',
        metadata: { order_id: 'o1', payment_id: 'p1' },
        payments: [{ id: 'pay_1', status: 'paid', amount: 29_900, currency: 'SAR' }],
      }),
    ).toMatchObject({
      providerPaymentId: 'inv_1',
      status: 'PAID',
      amount: 29_900,
      currency: 'SAR',
      orderId: 'o1',
      paymentId: 'p1',
      failureCode: null,
    })
  })
})

describe('idempotency fingerprint', () => {
  it('ignores key order and undefined fields but not values', () => {
    expect(requestFingerprint({ a: 1, b: { c: 2, d: undefined } })).toBe(
      requestFingerprint({ b: { c: 2 }, a: 1 }),
    )
    expect(requestFingerprint({ a: 1 })).not.toBe(requestFingerprint({ a: 2 }))
    expect(requestFingerprint([1, 2])).not.toBe(requestFingerprint([2, 1]))
  })

  it('fits entity-scoped keys and refuses oversized scopes before touching the database', async () => {
    // The return route scopes keys per order: "return:<uuid>" (43 characters).
    expect(`return:${crypto.randomUUID()}`.length).toBeLessThanOrEqual(IDEMPOTENCY_SCOPE_MAX_LENGTH)
    const run = () => Promise.resolve({ ok: true })
    await expect(
      withIdempotency(
        { scope: 'x'.repeat(IDEMPOTENCY_SCOPE_MAX_LENGTH + 1), key: 'k', userId: null, body: {} },
        run,
      ),
    ).rejects.toThrow(/longer than 80/)
  })
})
