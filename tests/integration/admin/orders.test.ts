import type { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { POST as cancelRoute } from '@/app/api/admin/orders/[id]/cancel/route'
import { POST as confirmRoute } from '@/app/api/admin/orders/[id]/confirm/route'
import { POST as deliverRoute } from '@/app/api/admin/orders/[id]/deliver/route'
import { POST as refundRoute } from '@/app/api/admin/orders/[id]/refund/route'
import { POST as resolveRoute } from '@/app/api/admin/orders/[id]/resolve-attention/route'
import { POST as shipRoute } from '@/app/api/admin/orders/[id]/ship/route'
import { POST as approveRoute } from '@/app/api/admin/returns/[id]/approve/route'
import { POST as completeRoute } from '@/app/api/admin/returns/[id]/complete/route'
import { prisma } from '@/db/client'
import { getAdminOrder, listAdminOrders } from '@/services/admin/orders.service'
import { requestReturn } from '@/services/orders/returns.service'
import { refundCancelledOrder } from '@/services/payments/payment.service'
import type { TestClient } from '../helpers/http'
import {
  confirmedOrder,
  deliveredOrder,
  placeOrder,
  readyToCheckout,
  signedInCustomer,
  signedInStaff,
} from '../helpers/checkout'

type Body = { data?: Record<string, unknown>; error?: { code: string } }
type IdRoute = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>

function post(
  client: TestClient,
  route: IdRoute,
  id: string,
  body: unknown = {},
  headers?: Record<string, string>,
) {
  return client.call<Body, { id: string }>(route, { body, params: { id }, headers })
}

describe('admin order actions', () => {
  it('keeps customers and under-privileged staff out', async () => {
    const o = await confirmedOrder('admin-guard@example.test')
    const customer = await signedInCustomer('not-staff@example.test')
    expect((await post(customer.client, shipRoute, o.orderId)).status).toBe(403)

    const staff = await signedInStaff('staff-guard@example.test')
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: o.orderId } })
    // The seeded STAFF role may manage orders but not refund them.
    const refund = await post(
      staff.client,
      refundRoute,
      o.orderId,
      { paymentId: payment.id, amount: 100, reason: 'Test' },
      { 'Idempotency-Key': crypto.randomUUID() },
    )
    expect(refund.status).toBe(403)
    expect(await prisma.refund.count()).toBe(0)
  })

  it('confirms cash-on-delivery orders only, then ships and delivers them', async () => {
    const staff = await signedInStaff('staff-cod@example.test')
    const online = await readyToCheckout('online-unpaid@example.test')
    const placedOnline = await placeOrder(online.client, online.address.id)
    const refused = await post(staff.client, confirmRoute, placedOnline.body.data!.order.orderId)
    expect(refused.status).toBe(409)

    const cod = await readyToCheckout('cod-admin@example.test', { price: 40_000 })
    const placed = await placeOrder(cod.client, cod.address.id, { paymentMethod: 'COD' })
    const orderId = placed.body.data!.order.orderId
    expect(
      (await post(staff.client, confirmRoute, orderId, { note: 'Called the customer' })).status,
    ).toBe(200)
    expect((await post(staff.client, shipRoute, orderId, {})).status).toBe(200)
    expect((await post(staff.client, deliverRoute, orderId)).status).toBe(200)

    const detail = await getAdminOrder(orderId)
    expect(detail).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PAID' })
    expect(detail.history.map((entry) => entry.toStatus)).toEqual([
      'PENDING',
      'CONFIRMED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
    ])
    expect(detail.history[1]).toMatchObject({
      actorType: 'STAFF',
      actorName: staff.user.name,
      note: 'Called the customer',
    })
    expect(detail.actions).toMatchObject({ ship: false, cancel: false, deliver: false })
  })

  it('cancels a paid order and refunds it automatically', async () => {
    const admin = await signedInStaff('admin-cancel@example.test', 'ADMIN')
    const o = await confirmedOrder('paid-cancel@example.test', { stock: 2 })
    const res = await post(admin.client, cancelRoute, o.orderId, {
      reason: 'Customer asked by phone',
    })
    expect(res.status).toBe(200)
    // Until the refund has gone through, the order is flagged for the team.
    expect(await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } })).toMatchObject({
      status: 'CANCELLED',
      attentionReason: 'REFUND_REQUIRED',
    })
    // The route schedules the refund with after(); outside a live request (tests) run that step directly.
    await refundCancelledOrder(o.orderId, admin.audit)
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: o.orderId },
      include: { refunds: true },
    })
    expect(order).toMatchObject({
      status: 'CANCELLED',
      attentionReason: null,
      inventoryStatus: 'RESTOCKED',
    })
    expect(order.refunds).toMatchObject([{ status: 'SUCCEEDED', amount: o.order.total }])
    expect(
      await prisma.inventory.findUniqueOrThrow({ where: { variantId: o.variant.id } }),
    ).toMatchObject({ onHand: 2, reserved: 0 })
  })

  it('refunds once per idempotency key and never beyond the balance', async () => {
    const admin = await signedInStaff('admin-refund@example.test', 'ADMIN')
    const o = await confirmedOrder('partial-refund@example.test', { price: 50_000 })
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: o.orderId } })
    const key = crypto.randomUUID()
    const body = { paymentId: payment.id, amount: 20_000, reason: 'Price match' }
    const first = await post(admin.client, refundRoute, o.orderId, body, { 'Idempotency-Key': key })
    const retry = await post(admin.client, refundRoute, o.orderId, body, { 'Idempotency-Key': key })
    expect(first.status).toBe(200)
    expect(retry.body.data).toEqual(first.body.data)
    expect(await prisma.refund.count()).toBe(1)

    const tooMuch = await post(
      admin.client,
      refundRoute,
      o.orderId,
      { ...body, amount: 40_000 },
      { 'Idempotency-Key': crypto.randomUUID() },
    )
    expect(tooMuch.status).toBe(422)
    expect(tooMuch.body.error?.code).toBe('REFUND_NOT_ALLOWED')

    const other = await confirmedOrder('other-order@example.test')
    const wrongOrder = await post(admin.client, refundRoute, other.orderId, body, {
      'Idempotency-Key': crypto.randomUUID(),
    })
    expect(wrongOrder.status).toBe(404)
    expect((await getAdminOrder(o.orderId)).payments[0]).toMatchObject({
      refundedAmount: 20_000,
      refundable: 30_000,
    })
  })

  it('clears an attention flag with a note in the audit trail', async () => {
    const admin = await signedInStaff('admin-flag@example.test', 'ADMIN')
    const o = await confirmedOrder('flagged@example.test')
    await prisma.order.update({
      where: { id: o.orderId },
      data: { attentionReason: 'AMOUNT_MISMATCH' },
    })
    expect((await listAdminOrders({ attention: true }, 1, 25)).total).toBe(1)
    const res = await post(admin.client, resolveRoute, o.orderId, {
      note: 'Checked with the provider dashboard',
    })
    expect(res.status).toBe(200)
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } })).attentionReason,
    ).toBeNull()
    expect(
      await prisma.auditLog.count({
        where: { action: 'order.attention_resolved', entityId: o.orderId },
      }),
    ).toBe(1)
  })

  it('searches orders by number, email and mobile', async () => {
    const o = await confirmedOrder('findme@example.test')
    expect((await listAdminOrders({ q: o.order.orderNumber }, 1, 25)).rows).toHaveLength(1)
    expect((await listAdminOrders({ q: 'FINDME@example' }, 1, 25)).rows).toHaveLength(1)
    expect((await listAdminOrders({ q: '0500000101' }, 1, 25)).rows).toHaveLength(1)
    expect((await listAdminOrders({ q: 'nobody' }, 1, 25)).rows).toHaveLength(0)
  })
})

describe('admin return actions', () => {
  it('lets managers review and only refund-permitted staff complete', async () => {
    const o = await deliveredOrder('admin-return@example.test')
    const [item] = await prisma.orderItem.findMany({ where: { orderId: o.orderId } })
    const { returnId } = await requestReturn(
      o.user.id,
      o.orderId,
      { items: [{ orderItemId: item!.id, quantity: 1 }], reason: 'DEFECTIVE', note: null },
      { actor: { id: o.user.id, type: 'CUSTOMER' } },
    )
    const staff = await signedInStaff('staff-return@example.test')
    expect((await post(staff.client, approveRoute, returnId, { note: null })).status).toBe(200)
    const forbidden = await post(staff.client, completeRoute, returnId, {
      amount: null,
      note: null,
      transferReference: null,
    })
    expect(forbidden.status).toBe(403)
  })
})
