import 'server-only'
import { prisma } from '@/db/client'
import type { Prisma } from '@/generated/prisma/client'
import type { OrderStatus, PaymentMethod, PaymentStatus } from '@/generated/prisma/enums'
import { OrderNotFoundError } from '@/lib/errors'
import { canTransition } from '@/lib/orders/state-machine'
import { normalizeSaudiMobile } from '@/schemas/common'
import type { AdminOrderDetail, AdminOrderRow } from '@/types/admin-orders'
import { addDays } from '@/utils/time'

/** Back-office order queries. Writes go through the order, payment and fulfilment services. */

export interface AdminOrderFilters {
  q?: string
  status?: OrderStatus
  paymentStatus?: PaymentStatus
  method?: PaymentMethod
  stage?: 'to_ship'
  attention?: boolean
  refundPending?: boolean
  from?: Date
  /** Inclusive day: orders placed on this store-local day are included. */
  to?: Date
}

/** Accounts whose current email matches are found first, so every OR branch below is indexable. */
const MAX_MATCHED_ACCOUNTS = 50

/**
 * Search terms match the order's own number, email and name (trigram GIN
 * indexes), its phone (exact), or the customer's current account email via a
 * short list of user ids — never a join inside the OR, which would force a
 * scan of every order.
 */
export function orderWhere(
  filters: AdminOrderFilters,
  matchedUserIds: string[] = [],
): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = []
  if (filters.q) {
    const q = filters.q
    const phone = normalizeSaudiMobile(q)
    and.push({
      OR: [
        { orderNumber: { contains: q, mode: 'insensitive' } },
        { shippingEmail: { contains: q, mode: 'insensitive' } },
        { shippingName: { contains: q, mode: 'insensitive' } },
        ...(matchedUserIds.length > 0 ? [{ userId: { in: matchedUserIds } }] : []),
        ...(phone ? [{ shippingPhone: phone }] : []),
      ],
    })
  }
  if (filters.status) and.push({ status: filters.status })
  if (filters.paymentStatus) and.push({ paymentStatus: filters.paymentStatus })
  if (filters.method) and.push({ paymentMethod: filters.method })
  if (filters.stage === 'to_ship') and.push({ status: { in: ['CONFIRMED', 'PROCESSING'] } })
  if (filters.attention) and.push({ attentionReason: { not: null } })
  if (filters.refundPending) and.push({ refunds: { some: { status: 'PENDING' } } })
  if (filters.from) and.push({ createdAt: { gte: filters.from } })
  if (filters.to) and.push({ createdAt: { lt: addDays(filters.to, 1) } })
  return and.length > 0 ? { AND: and } : {}
}

export async function listAdminOrders(
  filters: AdminOrderFilters,
  page: number,
  pageSize: number,
): Promise<{ rows: AdminOrderRow[]; total: number }> {
  const matchedUsers = filters.q
    ? await prisma.user.findMany({
        where: { email: { contains: filters.q, mode: 'insensitive' } },
        select: { id: true },
        take: MAX_MATCHED_ACCOUNTS,
      })
    : []
  const where = orderWhere(
    filters,
    matchedUsers.map((user) => user.id),
  )
  const [total, orders] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        total: true,
        shippingName: true,
        attentionReason: true,
        user: { select: { email: true } },
        items: { select: { quantity: true } },
      },
    }),
  ])
  return {
    total,
    rows: orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      total: order.total,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      customerName: order.shippingName,
      customerEmail: order.user.email,
      attentionReason: order.attentionReason,
    })),
  }
}

export async function getAdminOrder(orderId: string): Promise<AdminOrderDetail> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      items: { orderBy: { createdAt: 'asc' } },
      payments: {
        orderBy: { createdAt: 'asc' },
        include: { refunds: { where: { status: 'PENDING' }, select: { amount: true } } },
      },
      refunds: {
        orderBy: { createdAt: 'asc' },
        include: { createdBy: { select: { name: true } } },
      },
      shipments: {
        orderBy: { createdAt: 'asc' },
        include: { events: { orderBy: { occurredAt: 'asc' } } },
      },
      returnRequests: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, returnNumber: true, status: true, createdAt: true },
      },
      statusHistory: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!order) throw new OrderNotFoundError()

  const actorIds = [
    ...new Set(order.statusHistory.flatMap((entry) => (entry.actorId ? [entry.actorId] : []))),
  ]
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true },
      })
    : []
  const actorName = new Map(actors.map((actor) => [actor.id, actor.name]))

  const payments = order.payments.map((payment) => {
    const pending = payment.refunds.reduce((sum, refund) => sum + refund.amount, 0)
    const captured = payment.status === 'PAID' || payment.status === 'PARTIALLY_REFUNDED'
    return {
      id: payment.id,
      provider: payment.provider,
      method: payment.method,
      status: payment.status,
      amount: payment.amount,
      refundedAmount: payment.refundedAmount,
      refundable: captured ? Math.max(payment.amount - payment.refundedAmount - pending, 0) : 0,
      providerPaymentId: payment.providerPaymentId,
      failureMessage: payment.failureMessage,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
    }
  })

  const status = order.status
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    shippingMethod: order.shippingMethod,
    createdAt: order.createdAt,
    confirmedAt: order.confirmedAt,
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
    cancelledAt: order.cancelledAt,
    cancellationReason: order.cancellationReason,
    attentionReason: order.attentionReason,
    locale: order.locale,
    customer: order.user,
    shipping: {
      name: order.shippingName,
      phone: order.shippingPhone,
      email: order.shippingEmail,
      city: order.shippingCity,
      district: order.shippingDistrict,
      street: order.shippingStreet,
      buildingNumber: order.shippingBuilding,
      postalCode: order.shippingPostalCode,
      additionalNumber: order.shippingAdditionalNo,
      instructions: order.shippingInstructions,
    },
    customerNote: order.customerNote,
    couponCode: order.couponCode,
    subtotal: order.subtotal,
    discountTotal: order.discountTotal,
    shippingTotal: order.shippingTotal,
    codFee: order.codFee,
    taxTotal: order.taxTotal,
    taxRateBps: order.taxRateBps,
    pricesIncludeTax: order.pricesIncludeTax,
    total: order.total,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      nameAr: item.productNameAr,
      nameEn: item.productNameEn,
      variantNameAr: item.variantNameAr,
      variantNameEn: item.variantNameEn,
      sku: item.sku,
      imageUrl: item.imageUrl,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      returnedQuantity: item.returnedQuantity,
      discountAmount: item.discountAmount,
      taxAmount: item.taxAmount,
      lineTotal: item.lineTotal,
    })),
    payments,
    refunds: order.refunds.map((refund) => ({
      id: refund.id,
      amount: refund.amount,
      status: refund.status,
      reason: refund.reason,
      reference: refund.providerRefundId,
      failureMessage: refund.failureMessage,
      createdAt: refund.createdAt,
      createdBy: refund.createdBy?.name ?? null,
    })),
    shipments: order.shipments.map((shipment) => ({
      id: shipment.id,
      provider: shipment.provider,
      carrier: shipment.carrier,
      trackingNumber: shipment.trackingNumber,
      trackingUrl: shipment.trackingUrl,
      status: shipment.status,
      shippedAt: shipment.shippedAt,
      deliveredAt: shipment.deliveredAt,
      events: shipment.events.map((event) => ({
        status: event.status,
        description: event.description,
        occurredAt: event.occurredAt,
      })),
    })),
    returns: order.returnRequests,
    history: order.statusHistory.map((entry) => ({
      toStatus: entry.toStatus,
      fromStatus: entry.fromStatus,
      actorType: entry.actorType,
      actorName: entry.actorId ? (actorName.get(entry.actorId) ?? null) : null,
      note: entry.note,
      createdAt: entry.createdAt,
    })),
    actions: {
      // Only cash-on-delivery orders are accepted by staff; online orders confirm when paid.
      confirm: status === 'PENDING' && order.paymentMethod === 'COD',
      process: status === 'CONFIRMED',
      ship: status === 'CONFIRMED' || status === 'PROCESSING',
      outForDelivery: status === 'SHIPPED',
      deliver: status === 'SHIPPED' || status === 'OUT_FOR_DELIVERY',
      cancel: canTransition(status, 'CANCELLED'),
      refund: payments.some((payment) => payment.refundable > 0),
      resolveAttention: order.attentionReason !== null,
    },
  }
}
