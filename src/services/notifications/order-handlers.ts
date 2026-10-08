import 'server-only'
import { prisma } from '@/db/client'
import type { Locale } from '@/i18n/config'
import { returnDeadline, type ReturnReason } from '@/lib/orders/returns'
import { registerOutboxHandler } from '@/services/events/outbox.service'
import { getSettings } from '@/services/settings/settings.service'
import { addressLines } from '@/utils/address'
import { appUrl } from './handlers'
import { localeOf, sendNotification } from './notification.service'
import {
  type EmailOrder,
  type EmailReturn,
  orderCancelledEmail,
  orderConfirmedCodEmail,
  orderDeliveredEmail,
  orderPaidEmail,
  orderReceivedEmail,
  orderRefundedEmail,
  orderShippedEmail,
  orderStaffEmail,
  paymentFailedEmail,
  returnApprovedEmail,
  returnCompletedEmail,
  returnRejectedEmail,
  returnRequestedEmail,
  returnStaffEmail,
} from './templates/orders'

/**
 * Customer emails for the order and return lifecycle. Each handler reloads
 * the current state (events carry ids only), sends in the language the order
 * was placed in, and is idempotent per event and template.
 *
 * Online orders are announced once the payment succeeds — never while it is
 * still pending — so a customer who abandons the payment page gets no
 * misleading "order received" message. The store's own email (Settings →
 * Store) is told about each order at the same moment, and about each return
 * request.
 */

async function loadOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { orderBy: { createdAt: 'asc' } },
      user: { select: { id: true, email: true, name: true } },
    },
  })
}

type LoadedOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>

function emailOrder(order: LoadedOrder, locale: Locale): EmailOrder {
  const ar = locale === 'ar'
  return {
    orderNumber: order.orderNumber,
    customerName: order.user.name,
    paymentMethod: order.paymentMethod,
    items: order.items.map((item) => ({
      name: ar ? item.productNameAr : item.productNameEn,
      variantName: (ar ? item.variantNameAr : item.variantNameEn) ?? null,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    subtotal: order.subtotal,
    discountTotal: order.discountTotal,
    shippingTotal: order.shippingTotal,
    codFee: order.codFee,
    taxTotal: order.taxTotal,
    taxRateBps: order.taxRateBps,
    pricesIncludeTax: order.pricesIncludeTax,
    total: order.total,
    address: addressLines(
      {
        buildingNumber: order.shippingBuilding,
        street: order.shippingStreet,
        district: order.shippingDistrict,
        city: order.shippingCity,
        postalCode: order.shippingPostalCode,
        additionalNumber: order.shippingAdditionalNo,
      },
      locale,
    ),
    orderUrl: appUrl(`/${locale}/account/orders/${order.id}`),
  }
}

async function sendOrderEmail(
  eventId: string,
  order: LoadedOrder,
  template: string,
  render: (locale: Locale, data: EmailOrder) => ReturnType<typeof orderPaidEmail>,
): Promise<void> {
  const locale = localeOf(order.locale)
  const data = emailOrder(order, locale)
  await sendNotification({
    outboxEventId: eventId,
    userId: order.userId,
    channel: 'EMAIL',
    template,
    locale,
    recipient: order.user.email,
    data: { orderNumber: order.orderNumber },
    render: () => render(locale, data),
  })
}

/** Tell the store an order is ready to handle, in the same event as the customer's email. */
async function sendStaffOrderEmail(eventId: string, order: LoadedOrder): Promise<void> {
  const store = await getSettings('store')
  const data = emailOrder(order, 'ar')
  await sendNotification({
    outboxEventId: eventId,
    userId: null,
    channel: 'EMAIL',
    template: 'order-staff',
    locale: 'ar',
    recipient: store.email,
    data: { orderNumber: order.orderNumber },
    render: () =>
      orderStaffEmail({
        ...data,
        customerEmail: order.user.email,
        recipientPhone: order.shippingPhone,
        adminUrl: appUrl(`/admin/orders/${order.id}`),
      }),
  })
}

async function loadReturn(returnRequestId: string) {
  return prisma.returnRequest.findUnique({
    where: { id: returnRequestId },
    include: {
      order: { select: { id: true, orderNumber: true, locale: true } },
      user: { select: { id: true, email: true, name: true } },
      items: { include: { orderItem: true }, orderBy: { id: 'asc' } },
    },
  })
}

type LoadedReturn = NonNullable<Awaited<ReturnType<typeof loadReturn>>>

function emailReturn(request: LoadedReturn, locale: Locale): EmailReturn {
  const ar = locale === 'ar'
  return {
    returnNumber: request.returnNumber,
    orderNumber: request.order.orderNumber,
    customerName: request.user.name,
    reason: request.reason as ReturnReason,
    items: request.items.map((item) => ({
      name: ar ? item.orderItem.productNameAr : item.orderItem.productNameEn,
      variantName: (ar ? item.orderItem.variantNameAr : item.orderItem.variantNameEn) ?? null,
      quantity: item.quantity,
    })),
    orderUrl: appUrl(`/${locale}/account/orders/${request.order.id}`),
  }
}

async function sendReturnEmail(
  eventId: string,
  request: LoadedReturn,
  template: string,
  render: (locale: Locale, data: EmailReturn) => ReturnType<typeof returnRequestedEmail>,
): Promise<void> {
  const locale = localeOf(request.order.locale)
  const data = emailReturn(request, locale)
  await sendNotification({
    outboxEventId: eventId,
    userId: request.userId,
    channel: 'EMAIL',
    template,
    locale,
    recipient: request.user.email,
    data: { orderNumber: request.order.orderNumber, returnNumber: request.returnNumber },
    render: () => render(locale, data),
  })
}

/** Cancellations whose own email already explains what happened. */
const PAYMENT_CANCELLATIONS = new Set(['PAYMENT_FAILED', 'PAYMENT_CANCELLED'])

let registered = false

export function registerOrderNotificationHandlers(): void {
  if (registered) return
  registered = true

  registerOutboxHandler('ORDER_PLACED', async (event) => {
    const order = await loadOrder(event.payload.orderId)
    // Online orders are announced when the payment succeeds.
    if (!order || order.paymentMethod !== 'COD' || order.status === 'CANCELLED') return
    await sendOrderEmail(event.id, order, 'order-received', orderReceivedEmail)
    await sendStaffOrderEmail(event.id, order)
  })

  registerOutboxHandler('PAYMENT_SUCCEEDED', async (event) => {
    const order = await loadOrder(event.payload.orderId)
    if (!order) return
    await sendOrderEmail(event.id, order, 'order-paid', orderPaidEmail)
    await sendStaffOrderEmail(event.id, order)
  })

  registerOutboxHandler('ORDER_CONFIRMED', async (event) => {
    const order = await loadOrder(event.payload.orderId)
    // Paid online orders were already confirmed by the payment email.
    if (!order || order.paymentMethod !== 'COD') return
    await sendOrderEmail(event.id, order, 'order-confirmed-cod', orderConfirmedCodEmail)
  })

  registerOutboxHandler('PAYMENT_FAILED', async (event) => {
    const order = await loadOrder(event.payload.orderId)
    if (!order) return
    await sendOrderEmail(event.id, order, 'payment-failed', (locale, data) =>
      paymentFailedEmail(locale, data, appUrl(`/${locale}/cart`)),
    )
  })

  registerOutboxHandler('ORDER_SHIPPED', async (event) => {
    const [order, shipment] = await Promise.all([
      loadOrder(event.payload.orderId),
      prisma.shipment.findUnique({
        where: { id: event.payload.shipmentId },
        select: { carrier: true, trackingNumber: true, trackingUrl: true },
      }),
    ])
    if (!order || !shipment) return
    await sendOrderEmail(event.id, order, 'order-shipped', (locale, data) =>
      orderShippedEmail(locale, data, shipment),
    )
  })

  registerOutboxHandler('ORDER_DELIVERED', async (event) => {
    const order = await loadOrder(event.payload.orderId)
    if (!order) return
    const returns = await getSettings('returns')
    const deadline = returns.enabled ? returnDeadline(order.deliveredAt, returns.windowDays) : null
    await sendOrderEmail(event.id, order, 'order-delivered', (locale, data) =>
      orderDeliveredEmail(locale, data, deadline),
    )
  })

  registerOutboxHandler('ORDER_CANCELLED', async (event) => {
    if (event.payload.reason && PAYMENT_CANCELLATIONS.has(event.payload.reason)) return
    const order = await loadOrder(event.payload.orderId)
    if (!order) return
    const refundExpected =
      order.paymentStatus === 'PAID' ||
      order.paymentStatus === 'PARTIALLY_REFUNDED' ||
      order.paymentStatus === 'REFUNDED'
    await sendOrderEmail(event.id, order, 'order-cancelled', (locale, data) =>
      orderCancelledEmail(locale, data, refundExpected),
    )
  })

  registerOutboxHandler('ORDER_REFUNDED', async (event) => {
    const refund = await prisma.refund.findUnique({
      where: { id: event.payload.refundId },
      select: { amount: true, status: true, returnRequestId: true },
    })
    // Refunds for returns are announced by the return-completed email.
    if (!refund || refund.status !== 'SUCCEEDED' || refund.returnRequestId) return
    const order = await loadOrder(event.payload.orderId)
    if (!order) return
    await sendOrderEmail(event.id, order, 'order-refunded', (locale, data) =>
      orderRefundedEmail(locale, data, refund.amount),
    )
  })

  registerOutboxHandler('RETURN_REQUESTED', async (event) => {
    const request = await loadReturn(event.payload.returnRequestId)
    if (!request) return
    await sendReturnEmail(event.id, request, 'return-requested', returnRequestedEmail)
    const store = await getSettings('store')
    const data = emailReturn(request, 'ar')
    await sendNotification({
      outboxEventId: event.id,
      userId: null,
      channel: 'EMAIL',
      template: 'return-staff',
      locale: 'ar',
      recipient: store.email,
      data: { returnNumber: request.returnNumber },
      render: () =>
        returnStaffEmail({
          ...data,
          customerEmail: request.user.email,
          note: request.customerNote,
          adminUrl: appUrl(`/admin/returns/${request.id}`),
        }),
    })
  })

  registerOutboxHandler('RETURN_APPROVED', async (event) => {
    const request = await loadReturn(event.payload.returnRequestId)
    if (!request) return
    await sendReturnEmail(event.id, request, 'return-approved', returnApprovedEmail)
  })

  registerOutboxHandler('RETURN_REJECTED', async (event) => {
    const request = await loadReturn(event.payload.returnRequestId)
    if (!request) return
    await sendReturnEmail(event.id, request, 'return-rejected', (locale, data) =>
      returnRejectedEmail(locale, data, request.adminNote),
    )
  })

  registerOutboxHandler('RETURN_COMPLETED', async (event) => {
    const request = await loadReturn(event.payload.returnRequestId)
    if (!request) return
    const refund = event.payload.refundId
      ? await prisma.refund.findUnique({
          where: { id: event.payload.refundId },
          select: { amount: true, status: true, providerRefundId: true },
        })
      : null
    const outcome =
      refund && refund.status === 'SUCCEEDED'
        ? { amount: refund.amount, manual: refund.providerRefundId?.startsWith('manual:') ?? false }
        : null
    await sendReturnEmail(event.id, request, 'return-completed', (locale, data) =>
      returnCompletedEmail(locale, data, outcome),
    )
  })
}
