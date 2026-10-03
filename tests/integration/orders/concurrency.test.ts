import { describe, expect, it } from 'vitest'
import { prisma } from '@/db/client'
import {
  addToBag,
  mockWebhookBody,
  placeOrder,
  previewTotal,
  sendMockWebhook,
  signedInCustomer,
  startPayment,
} from '../helpers/checkout'
import { createProduct } from '../helpers/factories'

/**
 * Spec §30 / §86 (mandatory): stock = 1, two customers check out at the same
 * moment → exactly one succeeds, the other gets INSUFFICIENT_STOCK, and stock
 * never goes negative.
 */
describe('overselling protection', () => {
  it('lets exactly one of two simultaneous checkouts buy the last unit', async () => {
    const { variant } = await createProduct({ stock: 1, price: 50_000 })
    const a = await signedInCustomer('race-a@example.test')
    const b = await signedInCustomer('race-b@example.test')
    await addToBag(a.client, variant.id)
    await addToBag(b.client, variant.id)
    const [totalA, totalB] = await Promise.all([
      previewTotal(a.client, { paymentMethod: 'MADA' }),
      previewTotal(b.client, { paymentMethod: 'MADA' }),
    ])

    const results = await Promise.all([
      placeOrder(a.client, a.address.id, { expectedTotal: totalA }),
      placeOrder(b.client, b.address.id, { expectedTotal: totalB }),
    ])
    const statuses = results.map((r) => r.status).sort()
    expect(statuses).toEqual([200, 409])
    const loser = results.find((r) => r.status === 409)!
    expect(loser.body.error?.code).toBe('INSUFFICIENT_STOCK')

    expect(await prisma.order.count()).toBe(1)
    const inventory = await prisma.inventory.findUniqueOrThrow({ where: { variantId: variant.id } })
    expect(inventory.onHand - inventory.reserved).toBe(0)
    expect(inventory.reserved).toBe(1)

    // The winner pays: the sale is recorded and the final stock is exactly 0.
    const winner = results.find((r) => r.status === 200)!.body.data!.order
    const winnerClient = results[0]!.status === 200 ? a.client : b.client
    const providerPaymentId = await startPayment(winnerClient, winner.orderId)
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: winner.orderId } })
    const res = await sendMockWebhook(
      mockWebhookBody({
        providerPaymentId,
        status: 'paid',
        amount: payment.amount,
        orderId: winner.orderId,
        paymentId: payment.id,
      }),
    )
    expect(res.status).toBe(200)
    expect(
      await prisma.inventory.findUniqueOrThrow({ where: { variantId: variant.id } }),
    ).toMatchObject({ onHand: 0, reserved: 0 })
  })

  it('never oversells under heavier contention', async () => {
    const { variant } = await createProduct({ stock: 3, price: 50_000 })
    const shoppers = await Promise.all(
      Array.from({ length: 8 }, (_, i) => signedInCustomer(`crowd-${i}@example.test`)),
    )
    for (const shopper of shoppers) await addToBag(shopper.client, variant.id)
    const totals = await Promise.all(
      shoppers.map((s) => previewTotal(s.client, { paymentMethod: 'MADA' })),
    )
    const results = await Promise.all(
      shoppers.map((s, i) => placeOrder(s.client, s.address.id, { expectedTotal: totals[i] })),
    )

    expect(results.filter((r) => r.status === 200)).toHaveLength(3)
    expect(
      results
        .filter((r) => r.status === 409)
        .every((r) => r.body.error?.code === 'INSUFFICIENT_STOCK'),
    ).toBe(true)
    const inventory = await prisma.inventory.findUniqueOrThrow({ where: { variantId: variant.id } })
    expect(inventory).toMatchObject({ onHand: 3, reserved: 3 })
    expect(
      await prisma.inventoryTransaction.count({
        where: { variantId: variant.id, type: 'RESERVATION' },
      }),
    ).toBe(3)
  })
})
