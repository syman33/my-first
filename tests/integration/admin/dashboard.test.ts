import { describe, expect, it } from 'vitest'
import { prisma } from '@/db/client'
import {
  getAttentionCounts,
  getDashboardSummary,
  getTopProducts,
} from '@/services/admin/dashboard.service'
import { cancelOrder } from '@/services/orders/order-lifecycle.service'
import { refundPayment } from '@/services/payments/payment.service'
import { confirmedOrder, placeOrder, readyToCheckout, staffAudit } from '../helpers/checkout'

describe('admin dashboard figures', () => {
  it('counts accepted sales only and nets nothing else in', async () => {
    const cod = await confirmedOrder('dash-cod@example.test', {
      paymentMethod: 'COD',
      price: 40_000,
    })
    const paid = await confirmedOrder('dash-paid@example.test', { price: 60_000, quantity: 2 })
    // Unpaid online order: not a sale.
    const pending = await readyToCheckout('dash-pending@example.test', { price: 70_000 })
    expect((await placeOrder(pending.client, pending.address.id)).status).toBe(200)
    // Cancelled order: not a sale.
    const cancelled = await confirmedOrder('dash-cancel@example.test', {
      paymentMethod: 'COD',
      price: 30_000,
    })
    const audit = await staffAudit()
    await cancelOrder(cancelled.orderId, { audit, reason: 'Customer called' })

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: paid.orderId } })
    await refundPayment(payment.id, { amount: 5_000, reason: 'Goodwill' }, audit)

    const summary = await getDashboardSummary('7d')
    const expectedSales = cod.order.total + paid.order.total
    expect(summary.current).toMatchObject({
      sales: expectedSales,
      orders: 2,
      averageOrderValue: Math.floor((expectedSales * 2 + 2) / 4),
      refunds: 5_000,
    })
    // Four shoppers plus the staff member; only customers count.
    expect(summary.current.newCustomers).toBe(4)
    expect(summary.series).toHaveLength(7)
    expect(summary.series.reduce((sum, point) => sum + point.sales, 0)).toBe(expectedSales)
    expect(summary.series[summary.series.length - 1]!.orders).toBe(2)
    expect(summary.previous).toMatchObject({ sales: 0, orders: 0 })

    const today = await getDashboardSummary('today')
    expect(today.granularity).toBe('hour')
    expect(today.series).toHaveLength(24)
    expect(today.current.sales).toBe(expectedSales)

    const top = await getTopProducts(summary.from, summary.to)
    expect(top[0]).toMatchObject({ productId: paid.product.id, units: 2 })
    expect(top.map((row) => row.productId)).not.toContain(cancelled.product.id)
  })

  it('reports waiting work only for areas the viewer may see', async () => {
    await confirmedOrder('dash-ship@example.test')
    const pending = await readyToCheckout('dash-cod-pending@example.test', { price: 40_000 })
    await placeOrder(pending.client, pending.address.id, { paymentMethod: 'COD' })

    const staff = await getAttentionCounts({ id: 's', role: 'STAFF', permissions: ['ORDERS_VIEW'] })
    expect(staff).toMatchObject({ readyToShip: 1, codAwaitingConfirmation: 1, lowStock: null })
    const admin = await getAttentionCounts({ id: 'a', role: 'ADMIN', permissions: [] })
    expect(admin.lowStock).not.toBeNull()
    expect(admin.messagesNew).toBe(0)
  })
})
