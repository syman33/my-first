import 'server-only'
import { prisma } from '@/db/client'
import type { Locale } from '@/i18n/config'
import { OrderNotFoundError } from '@/lib/errors'
import { canTransitionReturn, type ReturnReason } from '@/lib/orders/returns'
import { customerMayCancel } from '@/lib/orders/state-machine'
import { getSettings } from '@/services/settings/settings.service'
import type { CustomerOrderDetail, CustomerOrderSummary } from '@/types/orders'
import { returnableLines } from './returns.service'

export const ORDERS_PAGE_SIZE = 10

/** A customer's orders, newest first. Always scoped by user id. */
export async function listCustomerOrders(
  userId: string,
  page = 1,
): Promise<{ items: CustomerOrderSummary[]; total: number; pageCount: number }> {
  const where = { userId }
  const [total, rows] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * ORDERS_PAGE_SIZE,
      take: ORDERS_PAGE_SIZE,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        total: true,
        createdAt: true,
        items: { select: { quantity: true, imageUrl: true }, orderBy: { createdAt: 'asc' } },
      },
    }),
  ])
  return {
    total,
    pageCount: Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE)),
    items: rows.map(({ items, ...order }) => ({
      ...order,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      images: items.slice(0, 3).flatMap((item) => (item.imageUrl ? [item.imageUrl] : [])),
    })),
  }
}

/**
 * One order for its owner (another customer's order id is "not found").
 * Item names come from the snapshot taken at purchase, never from the live
 * catalogue, so history stays accurate when products change.
 */
export async function getCustomerOrder(
  userId: string,
  orderId: string,
  locale: Locale,
  now: Date = new Date(),
): Promise<CustomerOrderDetail> {
  return orderDetail({ id: orderId, userId }, locale, now)
}

/** The same view of any order, for the back office (callers check staff permissions). */
export async function getOrderDetailForStaff(
  orderId: string,
  locale: Locale,
  now: Date = new Date(),
): Promise<CustomerOrderDetail> {
  return orderDetail({ id: orderId }, locale, now)
}

async function orderDetail(
  where: { id: string; userId?: string },
  locale: Locale,
  now: Date,
): Promise<CustomerOrderDetail> {
  const order = await prisma.order.findFirst({
    where,
    include: {
      items: { orderBy: { createdAt: 'asc' } },
      statusHistory: { orderBy: { createdAt: 'asc' } },
      payments: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { status: true, method: true, paidAt: true },
      },
      shipments: {
        orderBy: { createdAt: 'desc' },
        select: {
          carrier: true,
          trackingNumber: true,
          trackingUrl: true,
          status: true,
          shippedAt: true,
          deliveredAt: true,
        },
      },
      returnRequests: {
        orderBy: { createdAt: 'desc' },
        include: {
          items: { orderBy: { id: 'asc' } },
          refunds: { where: { status: 'SUCCEEDED' }, select: { amount: true } },
        },
      },
    },
  })
  if (!order) throw new OrderNotFoundError()
  const returnable = await returnableLines(prisma, order, now)
  const { customerCancellableStatuses } = await getSettings('checkout')
  const ar = locale === 'ar'
  const payment = order.payments[0] ?? null
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    shippingMethod: order.shippingMethod,
    createdAt: order.createdAt,
    subtotal: order.subtotal,
    discountTotal: order.discountTotal,
    couponCode: order.couponCode,
    shippingTotal: order.shippingTotal,
    codFee: order.codFee,
    taxTotal: order.taxTotal,
    taxRateBps: order.taxRateBps,
    pricesIncludeTax: order.pricesIncludeTax,
    total: order.total,
    customerNote: order.customerNote,
    cancellationReason: order.cancellationReason,
    shippingAddress: {
      fullName: order.shippingName,
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
    items: order.items.map((item) => ({
      id: item.id,
      name: ar ? item.productNameAr : item.productNameEn,
      variantName: (ar ? item.variantNameAr : item.variantNameEn) ?? null,
      slug: (ar ? item.productSlugAr : item.productSlugEn) ?? null,
      sku: item.sku,
      imageUrl: item.imageUrl,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineSubtotal: item.lineSubtotal,
      discountAmount: item.discountAmount,
      taxAmount: item.taxAmount,
      lineTotal: item.lineTotal,
    })),
    history: order.statusHistory.map((entry) => ({
      status: entry.toStatus,
      at: entry.createdAt,
      note: entry.note,
    })),
    shipments: order.shipments,
    paidAt: payment?.paidAt ?? null,
    canCancel: customerMayCancel(order.status, customerCancellableStatuses),
    canPay:
      order.status === 'PENDING' &&
      order.paymentStatus === 'PENDING' &&
      order.paymentMethod !== 'COD' &&
      order.reservationExpiresAt !== null &&
      order.reservationExpiresAt > now,
    paymentDeadline: order.paymentMethod !== 'COD' ? order.reservationExpiresAt : null,
    returns: order.returnRequests.map((request) => ({
      id: request.id,
      returnNumber: request.returnNumber,
      status: request.status,
      reason: request.reason as ReturnReason,
      createdAt: request.createdAt,
      items: request.items.map((returned) => {
        const item = order.items.find((line) => line.id === returned.orderItemId)
        return {
          orderItemId: returned.orderItemId,
          name: item ? (ar ? item.productNameAr : item.productNameEn) : '',
          variantName: item ? ((ar ? item.variantNameAr : item.variantNameEn) ?? null) : null,
          quantity: returned.quantity,
        }
      }),
      refundedAmount: request.refunds.reduce((sum, refund) => sum + refund.amount, 0),
      rejectionNote: request.status === 'REJECTED' ? request.adminNote : null,
      canWithdraw:
        request.status === 'REQUESTED' && canTransitionReturn(request.status, 'CANCELLED'),
    })),
    returnable:
      returnable.deadline && returnable.lines.length > 0
        ? {
            deadline: returnable.deadline,
            items: returnable.lines.map((line) => ({
              orderItemId: line.orderItemId,
              maxQuantity: line.returnableQuantity,
            })),
          }
        : null,
  }
}

/** Minimal order state for the post-checkout page (owner only). */
export async function getOrderConfirmation(userId: string, orderNumber: string) {
  if (!/^VLR-\d{4}-\d{6,}$/.test(orderNumber)) return null
  return prisma.order.findFirst({
    where: { orderNumber, userId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      paymentMethod: true,
      total: true,
      taxTotal: true,
      shippingTotal: true,
      couponCode: true,
      shippingEmail: true,
      // Product-level lines for the purchase analytics event (no customer data).
      items: {
        orderBy: { createdAt: 'asc' },
        select: {
          productId: true,
          sku: true,
          productNameAr: true,
          productNameEn: true,
          variantNameAr: true,
          variantNameEn: true,
          unitPrice: true,
          quantity: true,
        },
      },
    },
  })
}
