import 'server-only'
import { prisma, type DbClient } from '@/db/client'
import type { OrderStatus } from '@/generated/prisma/enums'
import { AppError, InvalidOrderTransitionError, OrderNotFoundError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { canTransition, customerMayCancel } from '@/lib/orders/state-machine'
import { type AuditContext, recordAudit, SYSTEM_ACTOR } from '@/services/audit/audit.service'
import { enqueueEvent } from '@/services/events/outbox.service'
import {
  commitReservation,
  releaseReservation,
  restock,
  type StockLine,
} from '@/services/inventory/inventory.service'
import { getSettings } from '@/services/settings/settings.service'

/**
 * Order state changes with their side effects (stock, payments, coupons,
 * history, events, audit). Each runs in one transaction that first locks the
 * order row, so a payment confirmation and a reservation expiry for the same
 * order can never interleave.
 */

export async function lockOrder(tx: DbClient, orderId: string) {
  const locked = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`
  if (locked.length === 0) throw new OrderNotFoundError()
  return tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      items: {
        select: { id: true, variantId: true, sku: true, quantity: true, productId: true },
      },
      payments: { select: { id: true, status: true } },
    },
  })
}

type LockedOrder = Awaited<ReturnType<typeof lockOrder>>

function stockLines(order: LockedOrder): StockLine[] {
  // Items whose variant was deleted keep their snapshot but no longer hold stock.
  return order.items.flatMap((item) =>
    item.variantId ? [{ variantId: item.variantId, sku: item.sku, quantity: item.quantity }] : [],
  )
}

export async function history(
  tx: DbClient,
  order: { id: string; status: OrderStatus },
  to: OrderStatus,
  audit: AuditContext,
  note?: string | null,
) {
  await tx.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: to,
      actorType: audit.actor.type,
      actorId: audit.actor.id,
      note: note ?? null,
    },
  })
}

/**
 * PENDING → CONFIRMED: payment captured (online) or accepted by staff (COD).
 * The reservation becomes a sale and sales counters move.
 */
export async function confirmOrderInTx(
  tx: DbClient,
  orderId: string,
  audit: AuditContext,
  note?: string,
): Promise<void> {
  const order = await lockOrder(tx, orderId)
  if (!canTransition(order.status, 'CONFIRMED'))
    throw new InvalidOrderTransitionError(order.status, 'CONFIRMED')
  if (order.inventoryStatus !== 'RESERVED') {
    throw new AppError('CONFLICT', `Order ${order.orderNumber} holds no reservation`, {
      status: 409,
    })
  }
  await commitReservation(tx, stockLines(order), {
    orderId: order.id,
    reason: `Order ${order.orderNumber} confirmed`,
    actorType: audit.actor.type,
    actorId: audit.actor.id,
  })
  for (const item of order.items) {
    if (item.productId) {
      await tx.product.update({
        where: { id: item.productId },
        data: { salesCount: { increment: item.quantity } },
      })
    }
  }
  await tx.order.update({
    where: { id: order.id },
    data: {
      status: 'CONFIRMED',
      inventoryStatus: 'COMMITTED',
      confirmedAt: new Date(),
      reservationExpiresAt: null,
      version: { increment: 1 },
    },
  })
  await history(tx, order, 'CONFIRMED', audit, note)
  await enqueueEvent(tx, {
    type: 'ORDER_CONFIRMED',
    payload: { orderId: order.id },
    aggregateType: 'order',
    aggregateId: order.id,
  })
  await recordAudit(tx, audit, {
    action: 'order.confirmed',
    entityType: 'order',
    entityId: order.id,
    metadata: { orderNumber: order.orderNumber },
  })
}

export interface CancelOptions {
  audit: AuditContext
  reason: string | null
  /** Customer self-service: also checks the configured cancellable statuses. */
  byCustomerId?: string
}

/**
 * Cancel an order that has not shipped. Stock that never left the warehouse
 * goes back: a held reservation is released; units already committed are
 * restocked. Unpaid payments are cancelled; a captured payment is flagged for
 * refund (never silently kept). The coupon use is returned.
 */
export async function cancelOrderInTx(
  tx: DbClient,
  orderId: string,
  options: CancelOptions,
): Promise<void> {
  const order = await lockOrder(tx, orderId)
  if (options.byCustomerId && order.userId !== options.byCustomerId) throw new OrderNotFoundError()
  if (!canTransition(order.status, 'CANCELLED'))
    throw new InvalidOrderTransitionError(order.status, 'CANCELLED')
  if (options.byCustomerId) {
    const { customerCancellableStatuses } = await getSettings('checkout', tx)
    if (!customerMayCancel(order.status, customerCancellableStatuses)) {
      throw new AppError('ORDER_NOT_CANCELLABLE', 'This order can no longer be cancelled', {
        status: 409,
      })
    }
  }

  const ctx = {
    orderId: order.id,
    reason: `Order ${order.orderNumber} cancelled${options.reason ? `: ${options.reason}` : ''}`,
    actorType: options.audit.actor.type,
    actorId: options.audit.actor.id,
  }
  let inventoryStatus = order.inventoryStatus
  if (order.inventoryStatus === 'RESERVED') {
    await releaseReservation(tx, stockLines(order), ctx)
    inventoryStatus = 'RELEASED'
  } else if (order.inventoryStatus === 'COMMITTED') {
    await restock(tx, stockLines(order), 'CANCELLATION_RESTOCK', ctx)
    inventoryStatus = 'RESTOCKED'
    for (const item of order.items) {
      if (item.productId) {
        await tx.product.updateMany({
          where: { id: item.productId, salesCount: { gte: item.quantity } },
          data: { salesCount: { decrement: item.quantity } },
        })
      }
    }
  }

  await tx.payment.updateMany({
    where: { orderId: order.id, status: 'PENDING' },
    data: { status: 'CANCELLED', failedAt: new Date() },
  })
  const paid = order.payments.some((p) => p.status === 'PAID' || p.status === 'PARTIALLY_REFUNDED')

  if (order.couponId) {
    const usage = await tx.couponUsage.findUnique({
      where: { orderId: order.id },
      select: { id: true },
    })
    if (usage) {
      await tx.couponUsage.delete({ where: { id: usage.id } })
      await tx.coupon.updateMany({
        where: { id: order.couponId, usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      })
    }
  }

  await tx.order.update({
    where: { id: order.id },
    data: {
      status: 'CANCELLED',
      paymentStatus: paid ? order.paymentStatus : 'CANCELLED',
      inventoryStatus,
      cancelledAt: new Date(),
      cancelledBy: options.audit.actor.type,
      cancellationReason: options.reason,
      reservationExpiresAt: null,
      attentionReason: paid ? 'REFUND_REQUIRED' : order.attentionReason,
      version: { increment: 1 },
    },
  })
  await history(tx, order, 'CANCELLED', options.audit, options.reason)
  await enqueueEvent(tx, {
    type: 'ORDER_CANCELLED',
    payload: { orderId: order.id, reason: options.reason },
    aggregateType: 'order',
    aggregateId: order.id,
  })
  await recordAudit(tx, options.audit, {
    action: 'order.cancelled',
    entityType: 'order',
    entityId: order.id,
    metadata: { orderNumber: order.orderNumber, reason: options.reason, refundRequired: paid },
  })
}

export async function cancelOrder(orderId: string, options: CancelOptions): Promise<void> {
  await prisma.$transaction((tx) => cancelOrderInTx(tx, orderId, options))
}

export async function confirmOrder(
  orderId: string,
  audit: AuditContext,
  note?: string,
): Promise<void> {
  await prisma.$transaction((tx) => confirmOrderInTx(tx, orderId, audit, note))
}

/**
 * Release stock held by unpaid online orders whose payment window passed
 * (spec §31: reservations always expire). Safe on several workers at once:
 * each order is re-checked under its row lock before it is cancelled, so a
 * payment confirmed at the same moment wins or loses cleanly.
 */
export async function releaseExpiredReservations(
  now: Date = new Date(),
  batchSize = 50,
  maxBatches = 20,
): Promise<{ released: number; failed: number }> {
  let released = 0
  let failed = 0
  const seen = new Set<string>()
  for (let batch = 0; batch < maxBatches; batch++) {
    const candidates = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM orders
       WHERE status = 'PENDING' AND inventory_status = 'RESERVED' AND payment_status = 'PENDING'
         AND reservation_expires_at IS NOT NULL AND reservation_expires_at < ${now}
       ORDER BY reservation_expires_at
       LIMIT ${batchSize}`
    const fresh = candidates.filter(({ id }) => !seen.has(id))
    if (fresh.length === 0) break
    for (const { id } of fresh) {
      seen.add(id)
      try {
        await prisma.$transaction(async (tx) => {
          const order = await lockOrder(tx, id)
          // Paid or handled in the meantime: leave it alone.
          if (
            order.status !== 'PENDING' ||
            order.paymentStatus !== 'PENDING' ||
            order.inventoryStatus !== 'RESERVED' ||
            !order.reservationExpiresAt ||
            order.reservationExpiresAt >= now
          ) {
            return
          }
          await cancelOrderInTx(tx, id, {
            audit: { actor: SYSTEM_ACTOR },
            reason: 'PAYMENT_TIMEOUT',
          })
          released++
        })
      } catch (error) {
        failed++
        logger.error('orders.release_reservation_failed', { orderId: id, error })
      }
    }
    if (candidates.length < batchSize) break
  }
  if (released + failed > 0) logger.info('orders.reservations_released', { released, failed })
  return { released, failed }
}

/**
 * Staff accept a cash-on-delivery order (usually after a confirmation call).
 * Online orders are never confirmed by hand: only a verified payment does that.
 */
export async function confirmCodOrder(
  orderId: string,
  audit: AuditContext,
  note?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId)
    if (order.paymentMethod !== 'COD') {
      throw new AppError('CONFLICT', 'Online orders are confirmed by their payment', {
        status: 409,
      })
    }
    await confirmOrderInTx(tx, orderId, audit, note)
  })
}

/** Clear an order's "needs attention" flag once staff have dealt with it (the reason is kept in the audit trail). */
export async function resolveOrderAttention(
  orderId: string,
  note: string,
  audit: AuditContext,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId)
    if (!order.attentionReason) return
    await tx.order.update({ where: { id: order.id }, data: { attentionReason: null } })
    await recordAudit(tx, audit, {
      action: 'order.attention_resolved',
      entityType: 'order',
      entityId: order.id,
      metadata: { orderNumber: order.orderNumber, reason: order.attentionReason, note },
    })
  })
}
