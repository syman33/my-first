import { describe, expect, it } from 'vitest'
import {
  type EmailOrder,
  orderDeliveredEmail,
  orderPaidEmail,
  orderReceivedEmail,
  orderShippedEmail,
  orderStaffEmail,
  returnCompletedEmail,
  returnRejectedEmail,
  returnStaffEmail,
} from '@/services/notifications/templates/orders'

const order: EmailOrder = {
  orderNumber: 'VLR-2026-000042',
  customerName: 'Noura <script>alert(1)</script>',
  paymentMethod: 'MADA',
  items: [
    { name: 'Rose Gold Watch', variantName: '38mm', quantity: 1, lineTotal: 115_000 },
    { name: 'Leather Belt', variantName: null, quantity: 2, lineTotal: 40_000 },
  ],
  subtotal: 155_000,
  discountTotal: 0,
  shippingTotal: 0,
  codFee: 0,
  taxTotal: 20_217,
  taxRateBps: 1_500,
  pricesIncludeTax: true,
  total: 155_000,
  address: ['8123 Anas Bin Malik Road', 'Al Malqa, Riyadh', '13521'],
  orderUrl: 'https://velora.example/en/account/orders/abc',
}

describe('order emails', () => {
  it('escapes customer-controlled text', () => {
    const email = orderPaidEmail('en', order)
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
  })

  it('renders Arabic right-to-left with Arabic totals', () => {
    const email = orderReceivedEmail('ar', { ...order, paymentMethod: 'COD', codFee: 1_500 })
    expect(email.html).toContain('dir="rtl"')
    expect(email.subject).toContain('VLR-2026-000042')
    expect(email.html).toContain('الدفع عند الاستلام')
    expect(email.html).toContain('رسوم الدفع عند الاستلام')
  })

  it('shows included VAT as a note and exclusive VAT as a line', () => {
    const inclusive = orderPaidEmail('en', order)
    expect(inclusive.html).toContain('Includes VAT (15%)')
    const exclusive = orderPaidEmail('en', {
      ...order,
      pricesIncludeTax: false,
      taxTotal: 23_250,
      total: 178_250,
    })
    expect(exclusive.html).toContain('VAT (15%)')
    expect(exclusive.html).not.toContain('Includes VAT')
    expect(exclusive.text).toContain('SAR 1,782.50')
  })

  it('includes carrier and tracking details when shipped', () => {
    const email = orderShippedEmail('en', order, {
      carrier: 'SMSA',
      trackingNumber: '290012345678',
      trackingUrl: 'https://track.example/290012345678',
    })
    expect(email.text).toContain('Carrier: SMSA')
    expect(email.text).toContain('Tracking number: 290012345678')
    expect(email.html).toContain('href="https://track.example/290012345678"')
  })

  it('mentions the return deadline only when returns are open', () => {
    const open = orderDeliveredEmail('en', order, new Date('2026-10-10T12:00:00Z'))
    expect(open.text).toContain('request a return')
    const closed = orderDeliveredEmail('en', order, null)
    expect(closed.text).not.toContain('request a return')
  })

  it('alerts the store with the order, contact details and an admin link', () => {
    const email = orderStaffEmail({
      ...order,
      paymentMethod: 'COD',
      customerEmail: 'noura@example.test',
      recipientPhone: '0551234567',
      adminUrl: 'https://velora.example/admin/orders/abc',
    })
    expect(email.subject).toContain('VLR-2026-000042')
    expect(email.html).toContain('https://velora.example/admin/orders/abc')
    expect(email.html).not.toContain('<script>')
    expect(email.text).toContain('0551234567')
    expect(email.text).toContain('Cash on delivery')
    expect(email.text).toContain('Rose Gold Watch')
  })
})

describe('return emails', () => {
  const data = {
    returnNumber: 'RMA-2026-000007',
    orderNumber: order.orderNumber,
    customerName: 'Noura',
    reason: 'DEFECTIVE' as const,
    items: [{ name: 'Rose Gold Watch', variantName: '38mm', quantity: 1 }],
    orderUrl: order.orderUrl,
  }

  it('states the refund outcome', () => {
    expect(returnCompletedEmail('en', data, { amount: 57_500, manual: false }).text).toContain(
      'refunded SAR 575.00',
    )
    expect(returnCompletedEmail('en', data, { amount: 57_500, manual: true }).text).toContain(
      'transferred SAR 575.00',
    )
    expect(returnCompletedEmail('en', data, null).text).toContain('no refund')
  })

  it('passes the team note on rejection and escapes it', () => {
    const email = returnRejectedEmail('ar', data, 'المنتج مستخدم <b>')
    expect(email.text).toContain('المنتج مستخدم')
    expect(email.html).toContain('&lt;b&gt;')
  })

  it('notifies staff with a link to the admin return', () => {
    const email = returnStaffEmail({
      ...data,
      customerEmail: 'noura@example.test',
      note: 'Strap broke on day two',
      adminUrl: 'https://velora.example/admin/returns/xyz',
    })
    expect(email.subject).toContain('RMA-2026-000007')
    expect(email.html).toContain('https://velora.example/admin/returns/xyz')
    expect(email.text).toContain('Strap broke on day two')
  })
})
