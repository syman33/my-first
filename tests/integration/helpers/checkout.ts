import { expect } from 'vitest'
import { POST as login } from '@/app/api/auth/login/route'
import { POST as addItem } from '@/app/api/cart/items/route'
import { GET as preview } from '@/app/api/checkout/preview/route'
import { POST as checkoutRoute } from '@/app/api/checkout/route'
import { POST as payRoute } from '@/app/api/orders/[id]/pay/route'
import { POST as webhookRoute } from '@/app/api/webhooks/payments/[provider]/route'
import { prisma } from '@/db/client'
import { hashPassword } from '@/lib/auth/password'
import { MOCK_SIGNATURE_HEADER, signMockWebhook } from '@/services/payments/mock.provider'
import type { CartView } from '@/types/cart'
import { createProduct, createUser } from './factories'
import { TestClient } from './http'

export const PASSWORD = 'Desert-Rose-2026'

export async function signedInCustomer(email: string) {
  const user = await createUser({ email, passwordHash: await hashPassword(PASSWORD) })
  const client = new TestClient()
  expect((await client.call(login, { body: { email, password: PASSWORD } })).status).toBe(200)
  const address = await prisma.address.create({
    data: {
      userId: user.id,
      fullName: 'Noura Alotaibi',
      phone: '+966500000101',
      city: 'Riyadh',
      district: 'Al Malqa',
      street: 'Anas Bin Malik Road',
      buildingNumber: '8123',
      postalCode: '13521',
      isDefault: true,
    },
  })
  return { user, client, address }
}

export async function addToBag(client: TestClient, variantId: string, quantity = 1) {
  const res = await client.call(addItem, { body: { variantId, quantity } })
  expect(res.status).toBe(200)
}

export async function previewTotal(
  client: TestClient,
  options: { shippingMethod?: 'STANDARD' | 'EXPRESS'; paymentMethod?: string } = {},
): Promise<number> {
  const params = new URLSearchParams({ shippingMethod: options.shippingMethod ?? 'STANDARD' })
  if (options.paymentMethod) params.set('paymentMethod', options.paymentMethod)
  const res = await client.call<{ data: { cart: CartView } }>(preview, {
    path: `/api/checkout/preview?${params.toString()}`,
  })
  expect(res.status).toBe(200)
  return res.body.data.cart.totals.total
}

export interface CheckoutResult {
  status: number
  body: {
    data?: {
      order: { orderId: string; orderNumber: string; total: number; next: string }
      replayed: boolean
    }
    error?: { code: string; details?: Record<string, unknown> }
  }
}

export async function placeOrder(
  client: TestClient,
  addressId: string,
  options: {
    paymentMethod?: string
    shippingMethod?: 'STANDARD' | 'EXPRESS'
    key?: string
    expectedTotal?: number
    note?: string
  } = {},
): Promise<CheckoutResult> {
  const paymentMethod = options.paymentMethod ?? 'MADA'
  const shippingMethod = options.shippingMethod ?? 'STANDARD'
  const expectedTotal =
    options.expectedTotal ?? (await previewTotal(client, { shippingMethod, paymentMethod }))
  const res = await client.call<CheckoutResult['body']>(checkoutRoute, {
    body: {
      address: { type: 'saved', addressId },
      shippingMethod,
      paymentMethod,
      customerNote: options.note ?? null,
      expectedTotal,
    },
    headers: { 'Idempotency-Key': options.key ?? crypto.randomUUID() },
  })
  return { status: res.status, body: res.body }
}

/** A customer with one product in the bag, ready to check out. */
export async function readyToCheckout(
  email: string,
  product: { stock?: number; price?: number } = {},
) {
  const shopper = await signedInCustomer(email)
  const created = await createProduct({ stock: product.stock ?? 5, price: product.price ?? 50_000 })
  await addToBag(shopper.client, created.variant.id)
  return { ...shopper, ...created }
}

/** Ask the mock provider for a payment session (sets providerPaymentId on the payment). */
export async function startPayment(client: TestClient, orderId: string): Promise<string> {
  const res = await client.call<{ data: { redirectUrl: string } }, { id: string }>(payRoute, {
    body: {},
    params: { id: orderId },
  })
  expect(res.status).toBe(200)
  const payment = await prisma.payment.findFirstOrThrow({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
  })
  expect(payment.providerPaymentId).toMatch(/^mock_/)
  return payment.providerPaymentId!
}

export function mockWebhookBody(input: {
  eventId?: string
  providerPaymentId: string
  status: 'paid' | 'failed' | 'cancelled'
  amount: number
  currency?: string
  orderId?: string | null
  paymentId?: string | null
}): string {
  return JSON.stringify({
    id: input.eventId ?? `evt_${crypto.randomUUID()}`,
    type: `payment.${input.status}`,
    created: Math.floor(Date.now() / 1000),
    data: {
      id: input.providerPaymentId,
      status: input.status,
      amount: input.amount,
      currency: input.currency ?? 'SAR',
      metadata: { order_id: input.orderId ?? null, payment_id: input.paymentId ?? null },
    },
  })
}

export async function sendMockWebhook(
  rawBody: string,
  signature: string = signMockWebhook(rawBody),
) {
  const client = new TestClient()
  return client.call<
    { received?: boolean; status?: string; error?: { code: string } },
    { provider: string }
  >(webhookRoute, {
    rawBody,
    headers: { 'content-type': 'application/json', [MOCK_SIGNATURE_HEADER]: signature },
    params: { provider: 'mock' },
    noOrigin: true,
  })
}
