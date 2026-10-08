import { afterEach, describe, expect, it } from 'vitest'
import { prisma } from '@/db/client'
import { isAppError } from '@/lib/errors'
import { processPendingEvents } from '@/services/events/process'
import { getSettings } from '@/services/settings/settings.service'
import {
  markDelivered,
  markOutForDelivery,
  shipOrder,
  startProcessing,
} from '@/services/orders/fulfillment.service'
import { ManualShippingProvider, setShippingProvider } from '@/services/shipping/provider'
import { confirmedOrder, placeOrder, readyToCheckout, staffAudit } from '../helpers/checkout'

/** Store alerts about new orders, by order number. */
async function staffAlerts(orderId: string) {
  const { orderNumber } = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { orderNumber: true },
  })
  return prisma.notification.findMany({
    where: {
      template: 'order-staff',
      userId: null,
      data: { path: ['orderNumber'], equals: orderNumber },
    },
    select: { recipient: true },
  })
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

afterEach(() => setShippingProvider(null))

describe('fulfilment', () => {
  it('ships a confirmed order through processing, with a shipment, history and event', async () => {
    const o = await confirmedOrder('ship@example.test')
    const audit = await staffAudit()
    const { shipmentId } = await shipOrder(o.orderId, { note: 'Packed in gift box' }, audit)

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: o.orderId },
      include: { statusHistory: { orderBy: { createdAt: 'asc' } }, shipments: true },
    })
    expect(order.status).toBe('SHIPPED')
    expect(order.shippedAt).not.toBeNull()
    expect(order.statusHistory.map((h) => h.toStatus)).toEqual([
      'PENDING',
      'CONFIRMED',
      'PROCESSING',
      'SHIPPED',
    ])
    expect(order.shipments).toHaveLength(1)
    expect(order.shipments[0]).toMatchObject({
      id: shipmentId,
      provider: 'mock',
      status: 'IN_TRANSIT',
      createdById: audit.actor.id,
    })
    expect(order.shipments[0]!.trackingNumber).toMatch(/^MOCK-/)
    expect(
      await prisma.outboxEvent.count({ where: { type: 'ORDER_SHIPPED', aggregateId: o.orderId } }),
    ).toBe(1)
    expect(
      await prisma.auditLog.count({ where: { action: 'order.shipped', entityId: o.orderId } }),
    ).toBe(1)
  })

  it('refuses to ship an unpaid order or to ship twice', async () => {
    const shopper = await readyToCheckout('unpaid-ship@example.test')
    const placed = await placeOrder(shopper.client, shopper.address.id)
    const audit = await staffAudit()
    const pending = await errorOf(shipOrder(placed.body.data!.order.orderId, {}, audit))
    expect(pending).toMatchObject({ code: 'INVALID_ORDER_TRANSITION', status: 409 })

    const o = await confirmedOrder('twice@example.test')
    await shipOrder(o.orderId, {}, audit)
    expect(await errorOf(shipOrder(o.orderId, {}, audit))).toMatchObject({
      code: 'INVALID_ORDER_TRANSITION',
    })
    expect(await prisma.shipment.count({ where: { orderId: o.orderId } })).toBe(1)
  })

  it('records real carrier details with the manual provider and rejects reused tracking numbers', async () => {
    setShippingProvider(new ManualShippingProvider())
    const audit = await staffAudit()
    const first = await confirmedOrder('manual-1@example.test')
    const missing = await errorOf(shipOrder(first.orderId, {}, audit))
    expect(missing).toMatchObject({ code: 'VALIDATION_ERROR', status: 422 })

    await shipOrder(first.orderId, { carrier: 'SMSA', trackingNumber: '290019876543' }, audit)
    expect(
      await prisma.shipment.findFirstOrThrow({ where: { orderId: first.orderId } }),
    ).toMatchObject({
      provider: 'manual',
      carrier: 'SMSA',
      trackingNumber: '290019876543',
    })

    const second = await confirmedOrder('manual-2@example.test')
    const reused = await errorOf(
      shipOrder(second.orderId, { carrier: 'SMSA', trackingNumber: '290019876543' }, audit),
    )
    expect(reused).toMatchObject({ code: 'CONFLICT', status: 409 })
    // The failed attempt changed nothing.
    expect((await prisma.order.findUniqueOrThrow({ where: { id: second.orderId } })).status).toBe(
      'CONFIRMED',
    )
  })

  it('delivers a COD order and records the cash as collected', async () => {
    const o = await confirmedOrder('cod-deliver@example.test', { paymentMethod: 'COD' })
    const audit = await staffAudit()
    await startProcessing(o.orderId, audit)
    await shipOrder(o.orderId, {}, audit)
    await markOutForDelivery(o.orderId, audit)
    await markDelivered(o.orderId, audit)

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: o.orderId },
      include: { payments: true, shipments: { include: { events: true } } },
    })
    expect(order).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PAID' })
    expect(order.deliveredAt).not.toBeNull()
    expect(order.payments[0]).toMatchObject({
      method: 'COD',
      status: 'PAID',
      providerStatus: 'cash_collected',
    })
    expect(order.shipments[0]).toMatchObject({ status: 'DELIVERED' })
    expect(order.shipments[0]!.events.map((e) => e.status).sort()).toEqual([
      'DELIVERED',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
    ])
    expect(await errorOf(markDelivered(o.orderId, audit))).toMatchObject({
      code: 'INVALID_ORDER_TRANSITION',
    })
  })

  it('sends order emails at the right moments (online orders only once paid)', async () => {
    const cod = await confirmedOrder('mail-cod@example.test', { paymentMethod: 'COD' })
    const online = await confirmedOrder('mail-online@example.test')
    const audit = await staffAudit()
    await shipOrder(online.orderId, {}, audit)
    await processPendingEvents(100)

    const templates = async (orderUserId: string) =>
      (
        await prisma.notification.findMany({
          where: { userId: orderUserId },
          select: { template: true, status: true },
        })
      ).map((n) => n.template)

    // The console provider records each message without delivering it.
    expect(await templates(cod.user.id)).toEqual(
      expect.arrayContaining(['order-received', 'order-confirmed-cod']),
    )
    const onlineTemplates = await templates(online.user.id)
    expect(onlineTemplates).toEqual(expect.arrayContaining(['order-paid', 'order-shipped']))
    expect(onlineTemplates).not.toContain('order-received')
    expect(onlineTemplates).not.toContain('order-confirmed-cod')
    expect(
      await prisma.notification.count({ where: { userId: online.user.id, status: 'SENT' } }),
    ).toBe(0)

    // The store hears about each order once, at the same moment as the customer.
    const store = await getSettings('store')
    expect(await staffAlerts(cod.orderId)).toEqual([{ recipient: store.email }])
    expect(await staffAlerts(online.orderId)).toEqual([{ recipient: store.email }])
  })

  it('does not alert the store about an online order that was never paid', async () => {
    const shopper = await readyToCheckout('mail-unpaid@example.test')
    const placed = await placeOrder(shopper.client, shopper.address.id)
    expect(placed.status).toBe(200)
    await processPendingEvents(100)
    expect(await staffAlerts(placed.body.data!.order.orderId)).toEqual([])
  })
})
