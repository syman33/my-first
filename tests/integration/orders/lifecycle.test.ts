import { describe, expect, it } from 'vitest'
import { POST as cancelRoute } from '@/app/api/orders/[id]/cancel/route'
import { GET as orderRoute } from '@/app/api/orders/[id]/route'
import {
  GET as releaseCronGet,
  POST as releaseCron,
} from '@/app/api/cron/release-reservations/route'
import { prisma } from '@/db/client'
import { confirmOrder } from '@/services/orders/order-lifecycle.service'
import { SYSTEM_ACTOR } from '@/services/audit/audit.service'
import { type ApiError, TestClient } from '../helpers/http'
import { placeOrder, readyToCheckout, signedInCustomer } from '../helpers/checkout'

async function placed(email: string, paymentMethod = 'MADA') {
  const shopper = await readyToCheckout(email, { stock: 4, price: 50_000 })
  const res = await placeOrder(shopper.client, shopper.address.id, { paymentMethod })
  expect(res.status).toBe(200)
  return { ...shopper, orderId: res.body.data!.order.orderId }
}

describe('order lifecycle', () => {
  it('lets the customer cancel an unpaid order and releases its stock', async () => {
    const o = await placed('cancel-me@example.test')
    const res = await o.client.call<
      { data: { order: { status: string; canCancel: boolean } } },
      { id: string }
    >(cancelRoute, {
      body: {},
      params: { id: o.orderId },
    })
    expect(res.status).toBe(200)
    expect(res.body.data.order).toMatchObject({ status: 'CANCELLED', canCancel: false })
    expect(
      await prisma.inventory.findUniqueOrThrow({ where: { variantId: o.variant.id } }),
    ).toMatchObject({ onHand: 4, reserved: 0 })
    expect(
      await prisma.inventoryTransaction.count({
        where: { orderId: o.orderId, type: 'RESERVATION_RELEASE' },
      }),
    ).toBe(1)
    expect(
      await prisma.orderStatusHistory.count({
        where: { orderId: o.orderId, toStatus: 'CANCELLED' },
      }),
    ).toBe(1)
  })

  it('refuses cancellation after shipment and for other customers', async () => {
    const o = await placed('shipped@example.test', 'COD')
    await confirmOrder(o.orderId, { actor: SYSTEM_ACTOR })
    await prisma.order.update({ where: { id: o.orderId }, data: { status: 'SHIPPED' } })
    const late = await o.client.call<ApiError, { id: string }>(cancelRoute, {
      body: {},
      params: { id: o.orderId },
    })
    expect(late.status).toBe(409)

    const stranger = await signedInCustomer('stranger@example.test')
    expect(
      (
        await stranger.client.call<ApiError, { id: string }>(cancelRoute, {
          body: {},
          params: { id: o.orderId },
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await stranger.client.call<ApiError, { id: string }>(orderRoute, {
          params: { id: o.orderId },
        })
      ).status,
    ).toBe(404)
  })

  it('commits COD stock on confirmation and restocks it if cancelled before shipping', async () => {
    const o = await placed('cod-flow@example.test', 'COD')
    await confirmOrder(o.orderId, { actor: SYSTEM_ACTOR })
    expect(
      await prisma.inventory.findUniqueOrThrow({ where: { variantId: o.variant.id } }),
    ).toMatchObject({ onHand: 3, reserved: 0 })
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: o.product.id } })).salesCount,
    ).toBe(1)

    const res = await o.client.call<unknown, { id: string }>(cancelRoute, {
      body: {},
      params: { id: o.orderId },
    })
    expect(res.status).toBe(200)
    expect(
      await prisma.inventory.findUniqueOrThrow({ where: { variantId: o.variant.id } }),
    ).toMatchObject({ onHand: 4, reserved: 0 })
    expect(await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } })).toMatchObject({
      inventoryStatus: 'RESTOCKED',
    })
  })

  it('releases expired reservations through the authenticated cron endpoint', async () => {
    const o = await placed('expire@example.test')
    await prisma.order.update({
      where: { id: o.orderId },
      data: { reservationExpiresAt: new Date(Date.now() - 60_000) },
    })

    const anonymous = await new TestClient().call(releaseCron, { method: 'POST', noOrigin: true })
    expect(anonymous.status).toBe(401)
    const wrongSecret = await new TestClient().call(releaseCronGet, {
      method: 'GET',
      noOrigin: true,
      headers: { authorization: 'Bearer not-the-secret' },
    })
    expect(wrongSecret.status).toBe(401)
    // As Vercel Cron calls it: GET with the bearer secret.
    const authorised = await new TestClient().call<{ data: { released: number } }>(releaseCronGet, {
      method: 'GET',
      noOrigin: true,
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    expect(authorised.body.data.released).toBe(1)
    expect(await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } })).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: 'PAYMENT_TIMEOUT',
      inventoryStatus: 'RELEASED',
      paymentStatus: 'CANCELLED',
    })
    expect(
      await prisma.inventory.findUniqueOrThrow({ where: { variantId: o.variant.id } }),
    ).toMatchObject({ reserved: 0 })
  })

  it('returns a coupon use when its order is cancelled', async () => {
    await prisma.coupon.create({
      data: { code: 'BACKAGAIN', type: 'PERCENTAGE', value: 1_000, usageLimit: 5 },
    })
    const shopper = await readyToCheckout('coupon-cancel@example.test', { price: 50_000 })
    await prisma.cart.update({
      where: { userId: shopper.user.id },
      data: { couponCode: 'BACKAGAIN' },
    })
    const res = await placeOrder(shopper.client, shopper.address.id)
    expect(res.status).toBe(200)
    expect(
      (await prisma.coupon.findUniqueOrThrow({ where: { code: 'BACKAGAIN' } })).usedCount,
    ).toBe(1)
    await shopper.client.call<unknown, { id: string }>(cancelRoute, {
      body: {},
      params: { id: res.body.data!.order.orderId },
    })
    expect(
      (await prisma.coupon.findUniqueOrThrow({ where: { code: 'BACKAGAIN' } })).usedCount,
    ).toBe(0)
    expect(await prisma.couponUsage.count()).toBe(0)
  })
})
