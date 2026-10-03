import { describe, expect, it } from 'vitest'
import { prisma } from '@/db/client'
import { signMockWebhook } from '@/services/payments/mock.provider'
import { releaseExpiredReservations } from '@/services/orders/order-lifecycle.service'
import {
  mockWebhookBody,
  placeOrder,
  readyToCheckout,
  sendMockWebhook,
  startPayment,
} from '../helpers/checkout'

/** Spec §41 payment test matrix, driven through the real webhook endpoint with signed payloads. */
async function pendingOnlineOrder(email: string, stock = 5) {
  const shopper = await readyToCheckout(email, { stock, price: 50_000 })
  const placed = await placeOrder(shopper.client, shopper.address.id)
  expect(placed.status).toBe(200)
  const orderId = placed.body.data!.order.orderId
  const providerPaymentId = await startPayment(shopper.client, orderId)
  const payment = await prisma.payment.findFirstOrThrow({ where: { orderId } })
  const body = (
    status: 'paid' | 'failed' | 'cancelled',
    overrides: Partial<Parameters<typeof mockWebhookBody>[0]> = {},
  ) =>
    mockWebhookBody({
      providerPaymentId,
      status,
      amount: payment.amount,
      orderId,
      paymentId: payment.id,
      ...overrides,
    })
  return { ...shopper, orderId, providerPaymentId, payment, body }
}

async function state(orderId: string, variantId: string) {
  const [order, inventory, sales] = await Promise.all([
    prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: true } }),
    prisma.inventory.findUniqueOrThrow({ where: { variantId } }),
    prisma.inventoryTransaction.count({ where: { orderId, type: 'SALE' } }),
  ])
  return { order, inventory, sales }
}

describe('payment webhooks', () => {
  it('1. successful payment confirms the order and turns the reservation into a sale', async () => {
    const o = await pendingOnlineOrder('pay-ok@example.test')
    const res = await sendMockWebhook(o.body('paid'))
    expect(res.body).toMatchObject({ received: true, status: 'processed' })
    const s = await state(o.orderId, o.variant.id)
    expect(s.order).toMatchObject({
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      inventoryStatus: 'COMMITTED',
    })
    expect(s.order.payments[0]).toMatchObject({ status: 'PAID' })
    expect(s.inventory).toMatchObject({ onHand: 4, reserved: 0 })
    expect(s.sales).toBe(1)
  })

  it('2. failed payment cancels the order, releases stock and restores the bag', async () => {
    const o = await pendingOnlineOrder('pay-fail@example.test')
    await sendMockWebhook(o.body('failed'))
    const s = await state(o.orderId, o.variant.id)
    expect(s.order).toMatchObject({
      status: 'CANCELLED',
      paymentStatus: 'FAILED',
      inventoryStatus: 'RELEASED',
      cancellationReason: 'PAYMENT_FAILED',
    })
    expect(s.inventory).toMatchObject({ onHand: 5, reserved: 0 })
    expect(await prisma.cartItem.count({ where: { cart: { userId: o.user.id } } })).toBe(1)
  })

  it('3. cancelled payment cancels the order', async () => {
    const o = await pendingOnlineOrder('pay-cancel@example.test')
    await sendMockWebhook(o.body('cancelled'))
    const s = await state(o.orderId, o.variant.id)
    expect(s.order).toMatchObject({ status: 'CANCELLED', paymentStatus: 'CANCELLED' })
    expect(s.inventory.reserved).toBe(0)
  })

  it('4. a duplicate webhook is processed once', async () => {
    const o = await pendingOnlineOrder('pay-dup@example.test')
    const body = o.body('paid', { eventId: 'evt_duplicate_1' })
    const first = await sendMockWebhook(body)
    const second = await sendMockWebhook(body)
    expect(first.body.status).toBe('processed')
    expect(second.body.status).toBe('duplicate')
    const s = await state(o.orderId, o.variant.id)
    expect(s.sales).toBe(1)
    expect(s.inventory.onHand).toBe(4)
    expect(await prisma.outboxEvent.count({ where: { type: 'ORDER_CONFIRMED' } })).toBe(1)
  })

  it('5. an invalid signature is rejected without side effects', async () => {
    const o = await pendingOnlineOrder('pay-sig@example.test')
    const res = await sendMockWebhook(o.body('paid'), 't=1,v1=deadbeef')
    expect(res.status).toBe(401)
    expect((await state(o.orderId, o.variant.id)).order.paymentStatus).toBe('PENDING')
    expect(await prisma.paymentWebhookEvent.count()).toBe(0)
  })

  it('6. a wrong amount is rejected and flagged', async () => {
    const o = await pendingOnlineOrder('pay-amount@example.test')
    const res = await sendMockWebhook(o.body('paid', { amount: 1 }))
    expect(res.body.status).toBe('rejected')
    const s = await state(o.orderId, o.variant.id)
    expect(s.order).toMatchObject({
      status: 'PENDING',
      paymentStatus: 'PENDING',
      attentionReason: 'AMOUNT_MISMATCH',
    })
    expect(s.sales).toBe(0)
  })

  it('7. a wrong currency is rejected', async () => {
    const o = await pendingOnlineOrder('pay-currency@example.test')
    const res = await sendMockWebhook(o.body('paid', { currency: 'USD' }))
    expect(res.body.status).toBe('rejected')
    expect((await state(o.orderId, o.variant.id)).order).toMatchObject({
      paymentStatus: 'PENDING',
      attentionReason: 'CURRENCY_MISMATCH',
    })
  })

  it('8. an unknown payment is ignored and creates nothing', async () => {
    const before = await prisma.order.count()
    const res = await sendMockWebhook(
      mockWebhookBody({ providerPaymentId: 'mock_unknown_payment', status: 'paid', amount: 100 }),
    )
    expect(res.body.status).toBe('ignored')
    expect(await prisma.order.count()).toBe(before)
    expect(await prisma.payment.count()).toBe(0)
  })

  it('9. an already-paid order is not paid (or committed) twice', async () => {
    const o = await pendingOnlineOrder('pay-twice@example.test')
    await sendMockWebhook(o.body('paid'))
    const again = await sendMockWebhook(o.body('paid'))
    expect(again.body.status).toBe('processed')
    const s = await state(o.orderId, o.variant.id)
    expect(s.sales).toBe(1)
    expect(s.inventory.onHand).toBe(4)
    expect(await prisma.payment.count({ where: { orderId: o.orderId, status: 'PAID' } })).toBe(1)
  })

  it('10. a replayed webhook is refused once its signature is stale, and deduplicated before that', async () => {
    const o = await pendingOnlineOrder('pay-replay@example.test')
    const body = o.body('paid', { eventId: 'evt_replay_1' })
    const stale = signMockWebhook(body, Math.floor(Date.now() / 1000) - 3_600)
    expect((await sendMockWebhook(body, stale)).status).toBe(401)
    expect((await sendMockWebhook(body)).body.status).toBe('processed')
    expect((await sendMockWebhook(body)).body.status).toBe('duplicate')
  })

  it('a payment that arrives after the reservation expired is kept and flagged for refund', async () => {
    const o = await pendingOnlineOrder('pay-late@example.test')
    await prisma.order.update({
      where: { id: o.orderId },
      data: { reservationExpiresAt: new Date(Date.now() - 1_000) },
    })
    expect((await releaseExpiredReservations()).released).toBe(1)
    await sendMockWebhook(o.body('paid'))
    const s = await state(o.orderId, o.variant.id)
    expect(s.order).toMatchObject({
      status: 'CANCELLED',
      paymentStatus: 'PAID',
      attentionReason: 'PAID_AFTER_CANCELLATION',
    })
    expect(s.inventory).toMatchObject({ onHand: 5, reserved: 0 })
  })
})
