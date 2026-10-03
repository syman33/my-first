import { describe, expect, it } from 'vitest'
import { POST as returnsRoute } from '@/app/api/orders/[id]/returns/route'
import { POST as withdrawRoute } from '@/app/api/returns/[id]/cancel/route'
import { prisma } from '@/db/client'
import { isAppError } from '@/lib/errors'
import { getCustomerOrder } from '@/services/orders/order-query.service'
import {
  approveReturn,
  completeReturn,
  quoteReturnRefund,
  receiveReturn,
  rejectReturn,
} from '@/services/orders/returns.service'
import { refundPayment } from '@/services/payments/payment.service'
import type { TestClient } from '../helpers/http'
import { confirmedOrder, deliveredOrder, signedInCustomer, staffAudit } from '../helpers/checkout'

interface ReturnResponse {
  data?: { return: { returnId: string; returnNumber: string }; replayed: boolean }
  error?: { code: string; details?: Record<string, unknown> }
}

async function requestReturn(
  client: TestClient,
  orderId: string,
  items: { orderItemId: string; quantity: number }[],
  options: { key?: string; reason?: string } = {},
) {
  return client.call<ReturnResponse, { id: string }>(returnsRoute, {
    body: { items, reason: options.reason ?? 'DEFECTIVE', note: 'Clasp is loose' },
    params: { id: orderId },
    headers: { 'Idempotency-Key': options.key ?? crypto.randomUUID() },
  })
}

async function itemsOf(orderId: string) {
  return prisma.orderItem.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } })
}

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    if (isAppError(error)) return { code: error.code, status: error.status, error }
    throw error
  }
  throw new Error('expected the call to fail')
}

describe('returns', () => {
  it('takes a return from request to refund, restocking sellable units', async () => {
    const o = await deliveredOrder('return-full@example.test', { stock: 3 })
    const [item] = await itemsOf(o.orderId)
    const res = await requestReturn(o.client, o.orderId, [{ orderItemId: item!.id, quantity: 1 }])
    expect(res.status).toBe(200)
    const { returnId, returnNumber } = res.body.data!.return
    expect(returnNumber).toMatch(/^RMA-\d{4}-\d{6}$/)

    const view = await getCustomerOrder(o.user.id, o.orderId, 'en')
    expect(view.returns[0]).toMatchObject({ status: 'REQUESTED', canWithdraw: true })
    expect(view.returnable).toBeNull() // the only unit is claimed

    await approveReturn(returnId, { note: null }, o.audit)
    const onHandBefore = (
      await prisma.inventory.findUniqueOrThrow({ where: { variantId: o.variant.id } })
    ).onHand
    await receiveReturn(
      returnId,
      {
        items: (await prisma.returnItem.findMany({ where: { returnRequestId: returnId } })).map(
          (ri) => ({ returnItemId: ri.id, condition: 'SELLABLE' as const }),
        ),
        note: null,
      },
      o.audit,
    )
    expect(
      (await prisma.inventory.findUniqueOrThrow({ where: { variantId: o.variant.id } })).onHand,
    ).toBe(onHandBefore + 1)
    expect(
      await prisma.inventoryTransaction.count({
        where: { returnRequestId: returnId, type: 'RETURN_RESTOCK', quantityDelta: 1 },
      }),
    ).toBe(1)
    expect(
      (await prisma.orderItem.findUniqueOrThrow({ where: { id: item!.id } })).returnedQuantity,
    ).toBe(1)

    expect(await quoteReturnRefund(returnId)).toMatchObject({
      suggested: 50_000,
      refundable: 50_000,
      manual: false,
    })
    const done = await completeReturn(
      returnId,
      { amount: null, note: null, transferReference: null },
      o.audit,
    )
    expect(done).toMatchObject({ status: 'COMPLETED', amount: 50_000 })

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: o.orderId },
      include: { payments: true, refunds: true, statusHistory: true },
    })
    expect(order).toMatchObject({ status: 'REFUNDED', paymentStatus: 'REFUNDED' })
    expect(order.payments[0]).toMatchObject({ status: 'REFUNDED', refundedAmount: 50_000 })
    expect(order.refunds).toMatchObject([
      { amount: 50_000, status: 'SUCCEEDED', returnRequestId: returnId },
    ])
    expect(order.statusHistory.map((h) => h.toStatus)).toContain('REFUNDED')
    expect(await prisma.returnRequest.findUniqueOrThrow({ where: { id: returnId } })).toMatchObject(
      {
        status: 'COMPLETED',
      },
    )
    for (const type of [
      'RETURN_REQUESTED',
      'RETURN_APPROVED',
      'RETURN_COMPLETED',
      'ORDER_REFUNDED',
    ]) {
      expect(await prisma.outboxEvent.count({ where: { type } })).toBe(1)
    }

    // Completing again changes nothing and never refunds twice.
    expect(
      await errorOf(
        completeReturn(returnId, { amount: null, note: null, transferReference: null }, o.audit),
      ),
    ).toMatchObject({ code: 'CONFLICT' })
    expect(await prisma.refund.count()).toBe(1)
  })

  it('refunds partial returns pro rata and only closes the order when all is refunded', async () => {
    const o = await deliveredOrder('return-partial@example.test', { quantity: 3, price: 33_333 })
    const [item] = await itemsOf(o.orderId)
    const paid = item!.lineTotal

    let refunded = 0
    for (const quantity of [1, 2]) {
      const res = await requestReturn(o.client, o.orderId, [{ orderItemId: item!.id, quantity }])
      expect(res.status).toBe(200)
      const returnId = res.body.data!.return.returnId
      await approveReturn(returnId, { note: null }, o.audit)
      const returnItems = await prisma.returnItem.findMany({ where: { returnRequestId: returnId } })
      await receiveReturn(
        returnId,
        {
          items: returnItems.map((ri) => ({ returnItemId: ri.id, condition: 'SELLABLE' })),
          note: null,
        },
        o.audit,
      )
      const done = await completeReturn(
        returnId,
        { amount: null, note: null, transferReference: null },
        o.audit,
      )
      refunded += done.amount
      const order = await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } })
      if (quantity === 1) {
        expect(order).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PARTIALLY_REFUNDED' })
      }
    }
    // Every halala paid for the line comes back, no more.
    expect(refunded).toBe(paid)
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: o.orderId } })
    expect(payment.refundedAmount).toBe(payment.amount)
  })

  it('does not restock damaged units', async () => {
    const o = await deliveredOrder('return-damaged@example.test', { stock: 2 })
    const [item] = await itemsOf(o.orderId)
    const res = await requestReturn(o.client, o.orderId, [{ orderItemId: item!.id, quantity: 1 }])
    const returnId = res.body.data!.return.returnId
    await approveReturn(returnId, { note: null }, o.audit)
    const before = await prisma.inventory.findUniqueOrThrow({ where: { variantId: o.variant.id } })
    const [returnItem] = await prisma.returnItem.findMany({ where: { returnRequestId: returnId } })
    await receiveReturn(
      returnId,
      { items: [{ returnItemId: returnItem!.id, condition: 'DAMAGED' }], note: 'Scratched glass' },
      o.audit,
    )
    expect(
      await prisma.inventory.findUniqueOrThrow({ where: { variantId: o.variant.id } }),
    ).toMatchObject({ onHand: before.onHand })
    expect(
      await prisma.returnItem.findUniqueOrThrow({ where: { id: returnItem!.id } }),
    ).toMatchObject({
      condition: 'DAMAGED',
      restockedQuantity: 0,
    })
    // A lower refund than computed needs a written reason.
    expect(
      await errorOf(
        completeReturn(returnId, { amount: 10_000, note: null, transferReference: null }, o.audit),
      ),
    ).toMatchObject({ code: 'VALIDATION_ERROR' })
    const done = await completeReturn(
      returnId,
      { amount: 10_000, note: 'Damage beyond normal wear', transferReference: null },
      o.audit,
    )
    expect(done).toMatchObject({ status: 'COMPLETED', amount: 10_000 })
  })

  it('refunds cash-on-delivery returns by recorded bank transfer', async () => {
    const o = await deliveredOrder('return-cod@example.test', {
      paymentMethod: 'COD',
      price: 40_000,
    })
    const [item] = await itemsOf(o.orderId)
    const res = await requestReturn(o.client, o.orderId, [{ orderItemId: item!.id, quantity: 1 }])
    const returnId = res.body.data!.return.returnId
    await approveReturn(returnId, { note: null }, o.audit)
    const [returnItem] = await prisma.returnItem.findMany({ where: { returnRequestId: returnId } })
    await receiveReturn(
      returnId,
      { items: [{ returnItemId: returnItem!.id, condition: 'SELLABLE' }], note: null },
      o.audit,
    )
    expect(await quoteReturnRefund(returnId)).toMatchObject({ manual: true, suggested: 40_000 })
    expect(
      await errorOf(
        completeReturn(returnId, { amount: null, note: null, transferReference: null }, o.audit),
      ),
    ).toMatchObject({ code: 'VALIDATION_ERROR' })
    const done = await completeReturn(
      returnId,
      { amount: null, note: null, transferReference: 'TRF-88213' },
      o.audit,
    )
    expect(done.status).toBe('COMPLETED')
    expect(
      await prisma.refund.findFirstOrThrow({ where: { returnRequestId: returnId } }),
    ).toMatchObject({
      status: 'SUCCEEDED',
      amount: 40_000,
      providerRefundId: 'manual:TRF-88213',
    })
    // The COD fee and shipping were not part of the returned goods, so the order stays delivered.
    expect(await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } })).toMatchObject({
      status: 'DELIVERED',
      paymentStatus: 'PARTIALLY_REFUNDED',
    })
  })

  it('enforces ownership, delivery, the return window and quantities', async () => {
    const confirmed = await confirmedOrder('return-early@example.test')
    const [early] = await itemsOf(confirmed.orderId)
    const notDelivered = await requestReturn(confirmed.client, confirmed.orderId, [
      { orderItemId: early!.id, quantity: 1 },
    ])
    expect(notDelivered.status).toBe(422)
    expect(notDelivered.body.error).toMatchObject({
      code: 'RETURN_NOT_ALLOWED',
      details: { reason: 'NOT_DELIVERED' },
    })

    const o = await deliveredOrder('return-rules@example.test', { quantity: 2 })
    const [item] = await itemsOf(o.orderId)
    const tooMany = await requestReturn(o.client, o.orderId, [
      { orderItemId: item!.id, quantity: 3 },
    ])
    expect(tooMany.status).toBe(422)
    expect(tooMany.body.error?.details).toMatchObject({ reason: 'QUANTITY' })

    const stranger = await signedInCustomer('return-stranger@example.test')
    const stolen = await requestReturn(stranger.client, o.orderId, [
      { orderItemId: item!.id, quantity: 1 },
    ])
    expect(stolen.status).toBe(404)
    expect(stolen.body.error?.code).toBe('ORDER_NOT_FOUND')

    const foreignItem = await requestReturn(o.client, o.orderId, [
      { orderItemId: early!.id, quantity: 1 },
    ])
    expect(foreignItem.status).toBe(422)

    await prisma.order.update({
      where: { id: o.orderId },
      data: { deliveredAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    })
    const late = await requestReturn(o.client, o.orderId, [{ orderItemId: item!.id, quantity: 1 }])
    expect(late.status).toBe(422)
    expect(late.body.error?.details).toMatchObject({ reason: 'WINDOW_CLOSED' })
    expect(await prisma.returnRequest.count()).toBe(0)
  })

  it('creates one request for a double-submitted form', async () => {
    const o = await deliveredOrder('return-twice@example.test', { quantity: 2 })
    const [item] = await itemsOf(o.orderId)
    const key = crypto.randomUUID()
    const lines = [{ orderItemId: item!.id, quantity: 1 }]
    const [a, b] = await Promise.all([
      requestReturn(o.client, o.orderId, lines, { key }),
      requestReturn(o.client, o.orderId, lines, { key }),
    ])
    const statuses = [a.status, b.status].sort()
    // The second either replays the first or is told the first is still running.
    expect(statuses[0]).toBe(200)
    expect([200, 409]).toContain(statuses[1])
    expect(await prisma.returnRequest.count()).toBe(1)
  })

  it('lets the customer withdraw a request under review, but not after approval', async () => {
    const o = await deliveredOrder('return-withdraw@example.test', { quantity: 2 })
    const [item] = await itemsOf(o.orderId)
    const first = await requestReturn(o.client, o.orderId, [{ orderItemId: item!.id, quantity: 1 }])
    const firstId = first.body.data!.return.returnId
    const withdrawn = await o.client.call<unknown, { id: string }>(withdrawRoute, {
      body: {},
      params: { id: firstId },
    })
    expect(withdrawn.status).toBe(200)
    expect(await prisma.returnRequest.findUniqueOrThrow({ where: { id: firstId } })).toMatchObject({
      status: 'CANCELLED',
    })

    const second = await requestReturn(o.client, o.orderId, [
      { orderItemId: item!.id, quantity: 2 },
    ])
    expect(second.status).toBe(200) // the withdrawn unit is returnable again
    const secondId = second.body.data!.return.returnId
    await approveReturn(secondId, { note: null }, o.audit)
    const tooLate = await o.client.call<{ error: { details: { reason: string } } }, { id: string }>(
      withdrawRoute,
      { body: {}, params: { id: secondId } },
    )
    expect(tooLate.status).toBe(422)
    expect(tooLate.body.error.details.reason).toBe('ALREADY_REVIEWED')

    const stranger = await signedInCustomer('withdraw-stranger@example.test')
    expect(
      (
        await stranger.client.call<unknown, { id: string }>(withdrawRoute, {
          body: {},
          params: { id: secondId },
        })
      ).status,
    ).toBe(404)
  })

  it('shows the rejection reason to the customer', async () => {
    const o = await deliveredOrder('return-reject@example.test')
    const [item] = await itemsOf(o.orderId)
    const res = await requestReturn(o.client, o.orderId, [{ orderItemId: item!.id, quantity: 1 }], {
      reason: 'CHANGED_MIND',
    })
    const returnId = res.body.data!.return.returnId
    await rejectReturn(returnId, { note: 'Worn items cannot be returned' }, o.audit)
    const view = await getCustomerOrder(o.user.id, o.orderId, 'en')
    expect(view.returns[0]).toMatchObject({
      status: 'REJECTED',
      rejectionNote: 'Worn items cannot be returned',
      canWithdraw: false,
    })
    // The unit is no longer claimed, so it can be requested again within the window.
    expect(view.returnable?.items).toEqual([{ orderItemId: item!.id, maxQuantity: 1 }])
  })
})

describe('refund safety', () => {
  it('never refunds more than was captured, even concurrently', async () => {
    const o = await confirmedOrder('refund-race@example.test')
    const audit = await staffAudit()
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: o.orderId } })
    const attempt = () =>
      refundPayment(payment.id, { amount: payment.amount, reason: 'Goodwill' }, audit)
    const results = await Promise.allSettled([attempt(), attempt()])
    const succeeded = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(succeeded).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    const reason = (rejected[0] as PromiseRejectedResult).reason
    expect(isAppError(reason) && reason.code).toBe('REFUND_NOT_ALLOWED')
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).refundedAmount,
    ).toBe(payment.amount)
    expect(await prisma.refund.count({ where: { status: 'SUCCEEDED' } })).toBe(1)
  })

  it('replays a refund retried with the same key', async () => {
    const o = await confirmedOrder('refund-retry@example.test')
    const audit = await staffAudit()
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: o.orderId } })
    const input = {
      amount: 10_000,
      reason: 'Price adjustment',
      idempotencyKey: `adj:${payment.id}`,
    }
    const first = await refundPayment(payment.id, input, audit)
    const second = await refundPayment(payment.id, input, audit)
    expect(second).toEqual(first)
    expect(await prisma.refund.count()).toBe(1)
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).refundedAmount,
    ).toBe(10_000)
  })
})
