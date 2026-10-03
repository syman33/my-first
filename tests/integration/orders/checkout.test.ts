import { describe, expect, it } from 'vitest'
import { POST as checkoutRoute } from '@/app/api/checkout/route'
import { prisma } from '@/db/client'
import { TestClient } from '../helpers/http'
import {
  addToBag,
  placeOrder,
  previewTotal,
  readyToCheckout,
  signedInCustomer,
} from '../helpers/checkout'
import { createProduct } from '../helpers/factories'

describe('checkout', () => {
  it('requires a signed-in customer and an idempotency key', async () => {
    const anonymous = await new TestClient().call(checkoutRoute, { body: {} })
    expect(anonymous.status).toBe(401)

    const { client, address } = await readyToCheckout('nokey@example.test')
    const noKey = await client.call(checkoutRoute, {
      body: {
        address: { type: 'saved', addressId: address.id },
        shippingMethod: 'STANDARD',
        paymentMethod: 'MADA',
        expectedTotal: 0,
      },
    })
    expect(noKey.status).toBe(400)
  })

  it('creates the order with snapshots, a reservation and a pending payment, and empties the bag', async () => {
    const { client, address, product, variant } = await readyToCheckout('buyer@example.test', {
      stock: 3,
      price: 50_000,
    })
    const result = await placeOrder(client, address.id, { note: 'Call before delivery' })
    expect(result.status).toBe(200)
    const placed = result.body.data!.order
    expect(placed.orderNumber).toMatch(/^VLR-\d{4}-\d{6}$/)
    expect(placed.next).toBe('pay')

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: placed.orderId },
      include: { items: true, payments: true, statusHistory: true },
    })
    expect(order).toMatchObject({
      status: 'PENDING',
      paymentStatus: 'PENDING',
      inventoryStatus: 'RESERVED',
      subtotal: 50_000,
      shippingTotal: 0,
      total: 50_000,
      customerNote: 'Call before delivery',
      shippingCity: 'Riyadh',
    })
    expect(order.reservationExpiresAt!.getTime()).toBeGreaterThan(Date.now())
    expect(order.items).toHaveLength(1)
    expect(order.items[0]).toMatchObject({
      sku: variant.sku,
      unitPrice: 50_000,
      quantity: 1,
      lineTotal: 50_000,
      productNameEn: product.nameEn,
    })
    expect(order.payments).toMatchObject([
      { status: 'PENDING', amount: 50_000, provider: 'mock', method: 'MADA' },
    ])
    expect(order.statusHistory.map((h) => h.toStatus)).toEqual(['PENDING'])

    const inventory = await prisma.inventory.findUniqueOrThrow({ where: { variantId: variant.id } })
    expect(inventory).toMatchObject({ onHand: 3, reserved: 1 })
    expect(
      await prisma.inventoryTransaction.count({
        where: { orderId: order.id, type: 'RESERVATION' },
      }),
    ).toBe(1)
    expect(await prisma.cartItem.count()).toBe(0)
    expect(await prisma.outboxEvent.count({ where: { type: 'ORDER_PLACED' } })).toBe(1)
    expect(
      await prisma.auditLog.count({ where: { action: 'order.created', entityId: order.id } }),
    ).toBe(1)

    // Later catalogue changes never rewrite history.
    await prisma.product.update({
      where: { id: product.id },
      data: { nameEn: 'Renamed', price: 99_900 },
    })
    expect(
      (await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } })).productNameEn,
    ).toBe(product.nameEn)
  })

  it('refuses to charge an amount the customer did not see', async () => {
    const { client, address } = await readyToCheckout('changed@example.test', { price: 50_000 })
    const result = await placeOrder(client, address.id, { expectedTotal: 40_000 })
    expect(result.status).toBe(409)
    expect(result.body.error).toMatchObject({
      code: 'CART_CHANGED',
      details: { reason: 'TOTAL', total: 50_000 },
    })
    expect(await prisma.order.count()).toBe(0)
    expect(await prisma.cartItem.count()).toBe(1)
  })

  it('replays a retried request instead of creating a second order', async () => {
    const { client, address, variant } = await readyToCheckout('retry@example.test', { stock: 5 })
    const key = crypto.randomUUID()
    const total = await previewTotal(client, { paymentMethod: 'MADA' })
    const first = await placeOrder(client, address.id, { key, expectedTotal: total })
    const second = await placeOrder(client, address.id, { key, expectedTotal: total })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body.data).toMatchObject({
      replayed: true,
      order: { orderId: first.body.data!.order.orderId },
    })
    expect(await prisma.order.count()).toBe(1)
    expect(
      (await prisma.inventory.findUniqueOrThrow({ where: { variantId: variant.id } })).reserved,
    ).toBe(1)

    const conflicting = await placeOrder(client, address.id, {
      key,
      expectedTotal: total,
      note: 'different',
    })
    expect(conflicting.status).toBe(409)
    expect(conflicting.body.error?.code).toBe('IDEMPOTENCY_CONFLICT')
  })

  it('supports cash on delivery with its fee and no payment deadline', async () => {
    const { client, address } = await readyToCheckout('cod@example.test', { price: 40_000 })
    const result = await placeOrder(client, address.id, { paymentMethod: 'COD' })
    expect(result.status).toBe(200)
    expect(result.body.data!.order).toMatchObject({ total: 41_500, next: 'confirmation' })
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: result.body.data!.order.orderId },
      include: { payments: true },
    })
    expect(order).toMatchObject({ codFee: 1_500, reservationExpiresAt: null })
    expect(order.payments[0]).toMatchObject({ provider: 'cod', method: 'COD', status: 'PENDING' })
  })

  it('charges express delivery and rejects disabled methods', async () => {
    const { client, address } = await readyToCheckout('express@example.test', { price: 10_000 })
    const express = await placeOrder(client, address.id, { shippingMethod: 'EXPRESS' })
    expect(express.status).toBe(200)
    expect((await prisma.order.findFirstOrThrow()).shippingTotal).toBe(4_500)

    const again = await readyToCheckout('nocod@example.test', { price: 10_000 })
    await prisma.setting.upsert({
      where: { key: 'payments' },
      create: { key: 'payments', value: { enabledMethods: ['MADA'] } },
      update: { value: { enabledMethods: ['MADA'] } },
    })
    const cod = await placeOrder(again.client, again.address.id, {
      paymentMethod: 'COD',
      expectedTotal: 13_500,
    })
    expect(cod.status).toBe(422)
    expect(cod.body.error?.code).toBe('PAYMENT_METHOD_UNAVAILABLE')
  })

  it('consumes the coupon once and enforces its limits at checkout', async () => {
    await prisma.coupon.create({
      data: { code: 'ONLYONE', type: 'FIXED_AMOUNT', value: 5_000, usageLimit: 1 },
    })
    const a = await readyToCheckout('coupon-a@example.test', { price: 40_000 })
    const b = await readyToCheckout('coupon-b@example.test', { price: 40_000 })
    for (const shopper of [a, b]) {
      await prisma.cart.update({
        where: { userId: shopper.user.id },
        data: { couponCode: 'ONLYONE' },
      })
    }
    const first = await placeOrder(a.client, a.address.id)
    expect(first.status).toBe(200)
    expect(await prisma.coupon.findUniqueOrThrow({ where: { code: 'ONLYONE' } })).toMatchObject({
      usedCount: 1,
    })
    expect(await prisma.couponUsage.count()).toBe(1)

    const second = await placeOrder(b.client, b.address.id, { expectedTotal: 35_000 })
    expect(second.status).toBe(422)
    expect(second.body.error?.code).toBe('INVALID_COUPON')
  })

  it('rejects an empty bag and addresses belonging to someone else', async () => {
    const empty = await signedInCustomer('empty@example.test')
    const res = await placeOrder(empty.client, empty.address.id, { expectedTotal: 0 })
    expect(res.status).toBe(422)
    expect(res.body.error?.code).toBe('CART_EMPTY')

    const other = await signedInCustomer('other@example.test')
    const { variant } = await createProduct({ stock: 2 })
    await addToBag(other.client, variant.id)
    const stolen = await placeOrder(other.client, empty.address.id)
    expect(stolen.status).toBe(404)
    expect(stolen.body.error?.code).toBe('ADDRESS_NOT_FOUND')
  })
})
