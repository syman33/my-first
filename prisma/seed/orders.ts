/**
 * Demo order history (demo profile only): 20 orders and 15 reviews created
 * through the real services — cart, checkout, the mock payment provider,
 * fulfilment, cancellation and refunds, returns and review moderation — so
 * every total, stock movement, status-history row and payment is genuine.
 *
 * The services stamp "now", so afterwards each order's own records are moved
 * onto a believable timeline over the past month (placed, confirmed a couple
 * of hours later, shipped the next day, delivered days after). The audit
 * trail is append-only and keeps the real seeding time. Notifications for
 * this history are marked as handled so no email goes to the fictional
 * customers.
 *
 * Idempotent: a scenario whose order already exists (by its checkout
 * idempotency key) is skipped.
 */
import { prisma } from '../../src/db/client'
import type { PaymentMethod } from '../../src/generated/prisma/enums'
import { env } from '../../src/lib/env'
import { logger } from '../../src/lib/logger'
import { actorFromRole, type AuditContext } from '../../src/services/audit/audit.service'
import { addToCart, applyCouponToCart, getCartView } from '../../src/services/cart/cart.service'
import { placeOrder } from '../../src/services/orders/checkout.service'
import {
  markDelivered,
  markOutForDelivery,
  shipOrder,
  startProcessing,
} from '../../src/services/orders/fulfillment.service'
import { cancelOrder, confirmCodOrder } from '../../src/services/orders/order-lifecycle.service'
import {
  approveReturn,
  completeReturn,
  receiveReturn,
  requestReturn,
} from '../../src/services/orders/returns.service'
import { simulateMockPayment } from '../../src/services/payments/mock-simulator.service'
import { initiatePayment, refundCancelledOrder } from '../../src/services/payments/payment.service'
import { moderateReview, submitReview } from '../../src/services/reviews/review.service'
import { customers, devStaffAccounts } from './data/people'

type Stage =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'returned'
  | 'cancelled_by_customer'
  | 'cancelled_and_refunded'

interface SeedReview {
  sku: string
  rating: number
  title: string
  body: string
  /** null: left waiting for moderation. */
  decision: 'APPROVED' | 'REJECTED' | null
  reason?: string
}

interface Scenario {
  key: string
  customer: number
  items: { sku: string; quantity?: number }[]
  payment: Extract<PaymentMethod, 'COD' | 'MADA' | 'CARD' | 'APPLE_PAY'>
  shipping?: 'STANDARD' | 'EXPRESS'
  coupon?: string
  stage: Stage
  daysAgo: number
  reviews?: SeedReview[]
  returnSku?: string
}

const review = (
  sku: string,
  rating: number,
  title: string,
  body: string,
  decision: SeedReview['decision'] = 'APPROVED',
  reason?: string,
): SeedReview => ({ sku, rating, title, body, decision, reason })

const SCENARIOS: Scenario[] = [
  {
    key: 'seed-demo-01',
    customer: 0,
    items: [{ sku: 'VLR-BAG-LUNA' }],
    payment: 'MADA',
    stage: 'delivered',
    daysAgo: 29,
    reviews: [
      review(
        'VLR-BAG-LUNA',
        5,
        'أناقة تدوم',
        'الجلد ناعم والخياطة متقنة، والحقيبة تتسع لكل أغراضي اليومية. وصلت مغلفة بعناية.',
      ),
    ],
  },
  {
    key: 'seed-demo-02',
    customer: 1,
    items: [{ sku: 'VLR-WLT-ATLAS' }, { sku: 'VLR-BLT-NOBLE' }],
    payment: 'COD',
    stage: 'delivered',
    daysAgo: 27,
    reviews: [
      review(
        'VLR-WLT-ATLAS',
        4,
        'محفظة عملية',
        'حجمها مناسب للجيب وجيوب البطاقات كافية. اللون أغمق قليلاً من الصورة.',
      ),
      review('VLR-BLT-NOBLE', 5, 'حزام فاخر', 'الإبزيم ثقيل وأنيق والجلد سميك. هدية ممتازة.'),
    ],
  },
  {
    key: 'seed-demo-03',
    customer: 2,
    items: [{ sku: 'VLR-WCH-ELAN' }],
    payment: 'CARD',
    shipping: 'EXPRESS',
    stage: 'delivered',
    daysAgo: 25,
    reviews: [
      review(
        'VLR-WCH-ELAN',
        5,
        'Understated and elegant',
        'The dial is beautifully finished and the strap is comfortable from day one. Express delivery arrived the next morning.',
      ),
    ],
  },
  {
    key: 'seed-demo-04',
    customer: 3,
    items: [{ sku: 'VLR-BAG-AURELIA' }, { sku: 'VLR-JWL-CHARM' }],
    payment: 'APPLE_PAY',
    stage: 'returned',
    daysAgo: 23,
    returnSku: 'VLR-JWL-CHARM',
    reviews: [
      review(
        'VLR-BAG-AURELIA',
        4,
        'صغيرة وجميلة',
        'مثالية للمناسبات المسائية. تمنيت لو كانت السلسلة أطول قليلاً.',
      ),
    ],
  },
  {
    key: 'seed-demo-05',
    customer: 4,
    items: [{ sku: 'VLR-SUN-LUMIERE' }],
    payment: 'COD',
    stage: 'delivered',
    daysAgo: 22,
    reviews: [
      review('VLR-SUN-LUMIERE', 3, 'جيدة', 'العدسات ممتازة لكن الإطار أعرض مما توقعت لوجهي.'),
    ],
  },
  {
    key: 'seed-demo-06',
    customer: 5,
    items: [{ sku: 'VLR-BAG-CELESTE' }],
    payment: 'COD',
    stage: 'cancelled_by_customer',
    daysAgo: 20,
  },
  {
    key: 'seed-demo-07',
    customer: 6,
    items: [{ sku: 'VLR-BAG-NOIR' }, { sku: 'VLR-WLT-RIMA' }],
    payment: 'MADA',
    coupon: 'VELORA10',
    stage: 'delivered',
    daysAgo: 19,
    reviews: [
      review(
        'VLR-BAG-NOIR',
        5,
        'رفيقتي اليومية',
        'خفيفة وتتسع للجوال والمحفظة والمفاتيح، والحزام قابل للتعديل.',
      ),
      review('VLR-WLT-RIMA', 4, 'لطيفة', 'محفظة صغيرة وأنيقة، أتمنى توفر لون إضافي.', null),
    ],
  },
  {
    key: 'seed-demo-08',
    customer: 7,
    items: [{ sku: 'VLR-JWL-HILAL' }, { sku: 'VLR-JWL-YASMIN' }],
    payment: 'COD',
    stage: 'delivered',
    daysAgo: 17,
    reviews: [
      review('VLR-JWL-HILAL', 5, 'تصميم مميز', 'القلادة رقيقة ولمعانها جميل، وصلت في علبة أنيقة.'),
      review(
        'VLR-JWL-YASMIN',
        1,
        'تواصلوا معي',
        'أبيع قطعاً مشابهة بسعر أقل، راسلوني على الرقم 0500000000.',
        'REJECTED',
        'Contains contact details and advertising',
      ),
    ],
  },
  {
    key: 'seed-demo-09',
    customer: 8,
    items: [{ sku: 'VLR-WCH-HORIZON' }],
    payment: 'CARD',
    stage: 'delivered',
    daysAgo: 15,
    reviews: [
      review(
        'VLR-WCH-HORIZON',
        4,
        'Great everyday watch',
        'Clean design and easy to read. The clasp took a day to get used to.',
      ),
    ],
  },
  {
    key: 'seed-demo-10',
    customer: 9,
    items: [{ sku: 'VLR-BAG-DUNE' }],
    payment: 'MADA',
    stage: 'delivered',
    daysAgo: 13,
    reviews: [review('VLR-BAG-DUNE', 5, 'تستحق', 'لونها الرملي راقٍ جداً ويتناسق مع كل ملابسي.')],
  },
  {
    key: 'seed-demo-11',
    customer: 0,
    items: [{ sku: 'VLR-WCH-MONACO' }],
    payment: 'CARD',
    stage: 'cancelled_and_refunded',
    daysAgo: 12,
  },
  {
    key: 'seed-demo-12',
    customer: 1,
    items: [{ sku: 'VLR-BLT-LINA' }, { sku: 'VLR-SUN-MARINA' }],
    payment: 'COD',
    stage: 'delivered',
    daysAgo: 10,
    reviews: [
      review('VLR-BLT-LINA', 4, 'رفيع وأنيق', 'يناسب الفساتين والبناطيل، والإبزيم الذهبي جميل.'),
      review('VLR-SUN-MARINA', 5, 'حماية وأناقة', 'خفيفة جداً ومريحة طوال اليوم.', null),
    ],
  },
  {
    key: 'seed-demo-13',
    customer: 2,
    items: [{ sku: 'VLR-BAG-SIENNA' }],
    payment: 'APPLE_PAY',
    shipping: 'EXPRESS',
    stage: 'delivered',
    daysAgo: 8,
    reviews: [
      review(
        'VLR-BAG-SIENNA',
        5,
        'Worth every riyal',
        'Roomy enough for a laptop and still looks polished. The lining is lovely.',
      ),
    ],
  },
  {
    key: 'seed-demo-14',
    customer: 3,
    items: [{ sku: 'VLR-BAG-LAYLA' }],
    payment: 'MADA',
    stage: 'shipped',
    daysAgo: 6,
  },
  {
    key: 'seed-demo-15',
    customer: 4,
    items: [{ sku: 'VLR-WLT-ZAHRA' }],
    payment: 'COD',
    stage: 'out_for_delivery',
    daysAgo: 5,
  },
  {
    key: 'seed-demo-16',
    customer: 5,
    items: [{ sku: 'VLR-SUN-FALCON' }, { sku: 'VLR-JWL-SULTAN' }],
    payment: 'CARD',
    stage: 'shipped',
    daysAgo: 4,
  },
  {
    key: 'seed-demo-17',
    customer: 6,
    items: [{ sku: 'VLR-BAG-METRO' }],
    payment: 'MADA',
    stage: 'processing',
    daysAgo: 3,
  },
  {
    key: 'seed-demo-18',
    customer: 7,
    items: [{ sku: 'VLR-BLT-DUO' }],
    payment: 'COD',
    stage: 'confirmed',
    daysAgo: 2,
  },
  {
    key: 'seed-demo-19',
    customer: 8,
    items: [{ sku: 'VLR-WLT-FARIS' }],
    payment: 'COD',
    stage: 'pending',
    daysAgo: 1,
  },
  // Placed just now and not paid yet: its stock hold expires on schedule like any other.
  {
    key: 'seed-demo-20',
    customer: 9,
    items: [{ sku: 'VLR-BAG-AMARA' }],
    payment: 'MADA',
    stage: 'pending',
    daysAgo: 0,
  },
]

const HOUR = 3_600_000

/**
 * Maps the real moments each lifecycle step ran to the moment it should
 * appear to have happened: step i covers real times from its start until the
 * next step starts, and lands at `at`.
 */
class Timeline {
  private readonly steps: { real: number; at: number }[] = []
  constructor(private readonly placedAt: Date) {}
  step(hoursAfterPlacing: number): void {
    this.steps.push({ real: Date.now(), at: this.placedAt.getTime() + hoursAfterPlacing * HOUR })
  }
  map(date: Date | null): Date | null {
    if (!date || this.steps.length === 0) return date
    const time = date.getTime()
    let current = this.steps[0]!
    for (const step of this.steps) if (step.real <= time) current = step
    return new Date(current.at + Math.max(0, time - current.real))
  }
}

async function pickVariant(sku: string, quantity: number) {
  const product = await prisma.product.findUnique({
    where: { sku },
    select: {
      id: true,
      status: true,
      variants: {
        where: { isActive: true },
        select: {
          id: true,
          sku: true,
          isDefault: true,
          inventory: { select: { onHand: true, reserved: true } },
        },
      },
    },
  })
  if (!product || product.status !== 'PUBLISHED')
    throw new Error(`Demo product ${sku} is not published`)
  const candidates = product.variants
    .map((variant) => ({
      ...variant,
      available: (variant.inventory?.onHand ?? 0) - (variant.inventory?.reserved ?? 0),
    }))
    .filter((variant) => variant.available >= quantity)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.available - a.available)
  const variant = candidates[0]
  if (!variant) throw new Error(`Demo product ${sku} has no option with ${quantity} in stock`)
  return { productId: product.id, variantId: variant.id }
}

/** Move every record of one order (and its reviews) onto the scenario's timeline. */
async function retime(orderId: string, timeline: Timeline): Promise<void> {
  const at = (date: Date | null) => timeline.map(date)
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } })
  await prisma.order.update({
    where: { id: orderId },
    data: {
      createdAt: at(order.createdAt)!,
      updatedAt: at(order.updatedAt)!,
      confirmedAt: at(order.confirmedAt),
      shippedAt: at(order.shippedAt),
      deliveredAt: at(order.deliveredAt),
      cancelledAt: at(order.cancelledAt),
      refundedAt: at(order.refundedAt),
      reservationExpiresAt: at(order.reservationExpiresAt),
    },
  })
  for (const row of await prisma.orderStatusHistory.findMany({ where: { orderId } })) {
    await prisma.orderStatusHistory.update({
      where: { id: row.id },
      data: { createdAt: at(row.createdAt)! },
    })
  }
  for (const row of await prisma.payment.findMany({ where: { orderId } })) {
    await prisma.payment.update({
      where: { id: row.id },
      data: {
        createdAt: at(row.createdAt)!,
        updatedAt: at(row.updatedAt)!,
        paidAt: at(row.paidAt),
        failedAt: at(row.failedAt),
        expiresAt: at(row.expiresAt),
      },
    })
  }
  for (const row of await prisma.shipment.findMany({
    where: { orderId },
    include: { events: true },
  })) {
    await prisma.shipment.update({
      where: { id: row.id },
      data: {
        createdAt: at(row.createdAt)!,
        updatedAt: at(row.updatedAt)!,
        shippedAt: at(row.shippedAt),
        deliveredAt: at(row.deliveredAt),
        cancelledAt: at(row.cancelledAt),
        estimatedDeliveryAt: at(row.estimatedDeliveryAt),
      },
    })
    for (const event of row.events) {
      await prisma.shipmentEvent.update({
        where: { id: event.id },
        data: { occurredAt: at(event.occurredAt)!, createdAt: at(event.createdAt)! },
      })
    }
  }
  for (const row of await prisma.refund.findMany({ where: { orderId } })) {
    await prisma.refund.update({
      where: { id: row.id },
      data: { createdAt: at(row.createdAt)!, completedAt: at(row.completedAt) },
    })
  }
  const returns = await prisma.returnRequest.findMany({ where: { orderId } })
  for (const row of returns) {
    await prisma.returnRequest.update({
      where: { id: row.id },
      data: {
        createdAt: at(row.createdAt)!,
        updatedAt: at(row.updatedAt)!,
        reviewedAt: at(row.reviewedAt),
        receivedAt: at(row.receivedAt),
        completedAt: at(row.completedAt),
      },
    })
  }
  const movements = await prisma.inventoryTransaction.findMany({
    where: { OR: [{ orderId }, { returnRequestId: { in: returns.map((row) => row.id) } }] },
  })
  for (const row of movements) {
    await prisma.inventoryTransaction.update({
      where: { id: row.id },
      data: { createdAt: at(row.createdAt)! },
    })
  }
  const usage = await prisma.couponUsage.findUnique({ where: { orderId } })
  if (usage) {
    await prisma.couponUsage.update({
      where: { id: usage.id },
      data: { createdAt: at(usage.createdAt)! },
    })
  }
  for (const row of await prisma.review.findMany({ where: { orderItem: { orderId } } })) {
    await prisma.review.update({
      where: { id: row.id },
      data: {
        createdAt: at(row.createdAt)!,
        updatedAt: at(row.updatedAt)!,
        moderatedAt: at(row.moderatedAt),
      },
    })
  }
}

async function runScenario(scenario: Scenario, staff: AuditContext, now: Date): Promise<void> {
  const seedCustomer = customers[scenario.customer % customers.length]!
  const customer = await prisma.user.findUniqueOrThrow({
    where: { email: seedCustomer.email },
    select: {
      id: true,
      email: true,
      locale: true,
      addresses: { where: { isDefault: true }, select: { id: true } },
    },
  })
  const address = customer.addresses[0]
  if (!address) throw new Error(`Demo customer ${seedCustomer.email} has no default address`)
  const locale = customer.locale === 'en' ? 'en' : 'ar'
  const owner = { userId: customer.id }
  const audit: AuditContext = { actor: actorFromRole(customer.id, 'CUSTOMER') }
  const placedAt = new Date(
    now.getTime() - scenario.daysAgo * 24 * HOUR - (scenario.daysAgo > 0 ? 5 * HOUR : 0),
  )
  const timeline = new Timeline(placedAt)
  const shippingMethod = scenario.shipping ?? 'STANDARD'

  // A fresh bag for this order.
  await prisma.cartItem.deleteMany({ where: { cart: { userId: customer.id } } })
  await prisma.cart.updateMany({ where: { userId: customer.id }, data: { couponCode: null } })
  const lines = []
  for (const item of scenario.items) {
    const picked = await pickVariant(item.sku, item.quantity ?? 1)
    lines.push({ ...picked, sku: item.sku })
    await addToCart(owner, { variantId: picked.variantId, quantity: item.quantity ?? 1 })
  }
  if (scenario.coupon)
    await applyCouponToCart(owner, scenario.coupon, { userId: customer.id, locale })
  const view = await getCartView(owner, locale, {
    userId: customer.id,
    shippingMethod,
    paymentMethod: scenario.payment,
  })

  timeline.step(0)
  const placed = await placeOrder(
    {
      address: { type: 'saved', addressId: address.id },
      shippingMethod,
      paymentMethod: scenario.payment,
      customerNote: null,
      expectedTotal: view.totals.total,
    },
    {
      user: { id: customer.id, email: customer.email, emailVerified: true },
      locale,
      idempotencyKey: scenario.key,
      audit,
    },
  )
  const orderId = placed.orderId
  const stage = scenario.stage

  if (stage === 'cancelled_by_customer') {
    timeline.step(4)
    await cancelOrder(orderId, {
      audit,
      reason: 'Ordered the wrong colour',
      byCustomerId: customer.id,
    })
  } else if (stage !== 'pending') {
    // Paid online, or a cash-on-delivery order confirmed by phone.
    timeline.step(scenario.payment === 'COD' ? 2 : 0.1)
    if (scenario.payment === 'COD') {
      await confirmCodOrder(orderId, staff, 'Confirmed by phone')
    } else {
      await initiatePayment(orderId, customer.id, locale)
      const payment = await prisma.payment.findFirstOrThrow({
        where: { orderId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      })
      await simulateMockPayment(payment.providerPaymentId!, 'SUCCESS', customer.id, locale)
    }
  } else if (scenario.payment !== 'COD') {
    // Unpaid online order: the customer opened the payment page and has not finished yet.
    await initiatePayment(orderId, customer.id, locale)
  }

  if (stage === 'cancelled_and_refunded') {
    timeline.step(6)
    await cancelOrder(orderId, { audit: staff, reason: 'Out of stock at the supplier' })
    timeline.step(7)
    await refundCancelledOrder(orderId, staff)
  }

  const progress: Stage[] = ['processing', 'shipped', 'out_for_delivery', 'delivered', 'returned']
  const reach = progress.indexOf(stage === 'returned' ? 'returned' : stage)
  if (reach >= progress.indexOf('processing')) {
    timeline.step(20)
    await startProcessing(orderId, staff)
  }
  if (reach >= progress.indexOf('shipped')) {
    timeline.step(26)
    await shipOrder(
      orderId,
      {
        carrier: 'SMSA',
        trackingNumber: `290${scenario.key.slice(-2)}${String(1_000_000 + scenario.daysAgo * 7919).slice(-6)}`,
      },
      staff,
    )
  }
  if (reach >= progress.indexOf('out_for_delivery')) {
    timeline.step(shippingMethod === 'EXPRESS' ? 30 : 70)
    await markOutForDelivery(orderId, staff)
  }
  if (reach >= progress.indexOf('delivered')) {
    timeline.step(shippingMethod === 'EXPRESS' ? 34 : 75)
    await markDelivered(orderId, staff)
  }

  if (stage === 'returned' && scenario.returnSku) {
    const line = lines.find((entry) => entry.sku === scenario.returnSku)
    const item = await prisma.orderItem.findFirstOrThrow({
      where: { orderId, productId: line?.productId },
    })
    timeline.step(120)
    const requested = await requestReturn(
      customer.id,
      orderId,
      {
        items: [{ orderItemId: item.id, quantity: 1 }],
        reason: 'CHANGED_MIND',
        note: 'Did not suit the outfit',
      },
      audit,
    )
    timeline.step(125)
    await approveReturn(requested.returnId, { note: null }, staff)
    const returnItems = await prisma.returnItem.findMany({
      where: { returnRequestId: requested.returnId },
    })
    timeline.step(170)
    await receiveReturn(
      requested.returnId,
      {
        items: returnItems.map((entry) => ({
          returnItemId: entry.id,
          condition: 'SELLABLE' as const,
        })),
        note: null,
      },
      staff,
    )
    timeline.step(172)
    await completeReturn(
      requested.returnId,
      { amount: null, note: null, transferReference: null },
      staff,
    )
  }

  for (const [index, entry] of (scenario.reviews ?? []).entries()) {
    const line = lines.find((candidate) => candidate.sku === entry.sku)
    if (!line) throw new Error(`Review for ${entry.sku} does not match an item of ${scenario.key}`)
    timeline.step(100 + index * 3)
    const submitted = await submitReview(
      customer.id,
      line.productId,
      { rating: entry.rating, title: entry.title, body: entry.body },
      /[؀-ۿ]/.test(entry.body) ? 'ar' : 'en',
      audit,
    )
    if (entry.decision) {
      timeline.step(110 + index * 3)
      await moderateReview(
        submitted.id,
        { decision: entry.decision, reason: entry.reason ?? null },
        staff,
      )
    }
  }

  if (scenario.daysAgo > 0) await retime(orderId, timeline)
}

export async function seedDemoOrders(
  now: Date = new Date(),
): Promise<{ created: number; skipped: number }> {
  if (env().PAYMENT_PROVIDER !== 'mock') {
    logger.warn('seed.demo_orders_skipped', {
      reason: 'Demo order history needs PAYMENT_PROVIDER=mock',
    })
    return { created: 0, skipped: SCENARIOS.length }
  }
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: devStaffAccounts.find((account) => account.role === 'ADMIN')!.email },
    select: { id: true },
  })
  const staff: AuditContext = { actor: actorFromRole(admin.id, 'ADMIN') }
  const startedAt = new Date()
  let created = 0
  let skipped = 0
  for (const scenario of SCENARIOS) {
    const existing = await prisma.order.findFirst({
      where: { idempotencyKey: { endsWith: `:${scenario.key}` } },
      select: { id: true },
    })
    if (existing) {
      skipped++
      continue
    }
    await runScenario(scenario, staff, now)
    created++
  }
  // The history is fictional: nobody should be emailed about it.
  await prisma.outboxEvent.updateMany({
    where: { createdAt: { gte: startedAt }, status: 'PENDING' },
    data: { status: 'PROCESSED', processedAt: new Date(), lastError: null },
  })
  return { created, skipped }
}
