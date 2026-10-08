import 'server-only'
import { type DbClient, prisma, readAll } from '@/db/client'
import { isUniqueViolation } from '@/db/errors'
import { AppError, InvalidOrderTransitionError } from '@/lib/errors'
import { canTransition } from '@/lib/orders/state-machine'
import { type AuditContext, recordAudit } from '@/services/audit/audit.service'
import { enqueueEvent } from '@/services/events/outbox.service'
import { getShippingProvider } from '@/services/shipping/provider'
import { getSettings } from '@/services/settings/settings.service'
import { history, lockOrder } from './order-lifecycle.service'

/**
 * Staff fulfilment steps: processing → shipped (with a shipment) → out for
 * delivery → delivered. Each step locks the order, validates the state
 * machine and records history, an event and an audit entry.
 */

async function move(
  tx: DbClient,
  orderId: string,
  to: 'PROCESSING' | 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED',
  audit: AuditContext,
  note?: string,
) {
  const order = await lockOrder(tx, orderId)
  if (!canTransition(order.status, to)) throw new InvalidOrderTransitionError(order.status, to)
  const now = new Date()
  await tx.order.update({
    where: { id: order.id },
    data: {
      status: to,
      version: { increment: 1 },
      ...(to === 'SHIPPED' ? { shippedAt: now } : {}),
      ...(to === 'DELIVERED' ? { deliveredAt: now } : {}),
    },
  })
  await history(tx, order, to, audit, note)
  await recordAudit(tx, audit, {
    action: `order.${to.toLowerCase()}`,
    entityType: 'order',
    entityId: order.id,
    metadata: { orderNumber: order.orderNumber, from: order.status, note: note ?? null },
  })
  return order
}

export async function startProcessing(
  orderId: string,
  audit: AuditContext,
  note?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await move(tx, orderId, 'PROCESSING', audit, note)
  })
}

export interface ShipInput {
  carrier?: string
  trackingNumber?: string
  trackingUrl?: string
  note?: string
}

/**
 * Hand the parcel to the carrier. A confirmed order passes through
 * PROCESSING automatically. One active shipment per order: a retry reuses it.
 */
export async function shipOrder(
  orderId: string,
  input: ShipInput,
  audit: AuditContext,
): Promise<{ shipmentId: string }> {
  const provider = getShippingProvider()
  const shippingSettings = await getSettings('shipping')
  return prisma.$transaction(async (tx) => {
    const current = await lockOrder(tx, orderId)
    if (current.status === 'CONFIRMED')
      await move(tx, orderId, 'PROCESSING', audit, 'Auto: preparing for shipment')
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { id: true, orderNumber: true, status: true, shippingMethod: true },
    })
    if (!canTransition(order.status, 'SHIPPED'))
      throw new InvalidOrderTransitionError(order.status, 'SHIPPED')

    const [existing, shipmentCount] = await readAll(tx, [
      () =>
        tx.shipment.findFirst({
          where: { orderId, status: { not: 'CANCELLED' } },
          select: { id: true },
        }),
      () => tx.shipment.count({ where: { orderId } }),
    ])
    const created = await provider.createShipment({
      orderNumber: order.orderNumber,
      service: order.shippingMethod,
      carrier: input.carrier,
      trackingNumber: input.trackingNumber,
      trackingUrl: input.trackingUrl,
      estimatedDays:
        order.shippingMethod === 'EXPRESS'
          ? shippingSettings.expressDaysMax
          : shippingSettings.standardDaysMax,
    })
    const now = new Date()
    const data = {
      provider: provider.name,
      carrier: created.carrier,
      trackingNumber: created.trackingNumber,
      trackingUrl: created.trackingUrl,
      providerShipmentId: created.providerShipmentId,
      estimatedDeliveryAt: created.estimatedDeliveryAt,
      status: 'IN_TRANSIT' as const,
      shippedAt: now,
    }
    let shipmentId: string
    try {
      const shipment = existing
        ? await tx.shipment.update({ where: { id: existing.id }, data, select: { id: true } })
        : await tx.shipment.create({
            data: {
              ...data,
              orderId,
              service: order.shippingMethod,
              createdById: audit.actor.id,
              idempotencyKey: `shipment:${orderId}:${shipmentCount + 1}`,
            },
            select: { id: true },
          })
      shipmentId = shipment.id
    } catch (error) {
      if (!isUniqueViolation(error, 'tracking_number')) throw error
      throw new AppError('CONFLICT', 'This tracking number is already used by another shipment', {
        status: 409,
        fieldErrors: { trackingNumber: 'trackingTaken' },
        cause: error,
      })
    }
    await tx.shipmentEvent.create({
      data: { shipmentId, status: 'IN_TRANSIT', description: 'Handed to carrier', occurredAt: now },
    })
    await move(tx, orderId, 'SHIPPED', audit, input.note)
    await enqueueEvent(tx, {
      type: 'ORDER_SHIPPED',
      payload: { orderId, shipmentId },
      aggregateType: 'order',
      aggregateId: orderId,
    })
    return { shipmentId }
  })
}

export async function markOutForDelivery(
  orderId: string,
  audit: AuditContext,
  note?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await move(tx, orderId, 'OUT_FOR_DELIVERY', audit, note)
    const shipment = await tx.shipment.findFirst({
      where: { orderId, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'desc' },
    })
    if (shipment) {
      await tx.shipment.update({ where: { id: shipment.id }, data: { status: 'OUT_FOR_DELIVERY' } })
      await tx.shipmentEvent.create({
        data: { shipmentId: shipment.id, status: 'OUT_FOR_DELIVERY', occurredAt: new Date() },
      })
    }
  })
}

/**
 * Delivered. For cash on delivery the courier collected the money, so the
 * COD payment is captured now (with the amount on record).
 */
export async function markDelivered(
  orderId: string,
  audit: AuditContext,
  note?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await move(tx, orderId, 'DELIVERED', audit, note)
    const now = new Date()
    const shipment = await tx.shipment.findFirst({
      where: { orderId, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'desc' },
    })
    if (shipment) {
      await tx.shipment.update({
        where: { id: shipment.id },
        data: { status: 'DELIVERED', deliveredAt: now },
      })
      await tx.shipmentEvent.create({
        data: { shipmentId: shipment.id, status: 'DELIVERED', occurredAt: now },
      })
    }
    if (order.paymentMethod === 'COD' && order.paymentStatus === 'PENDING') {
      await tx.payment.updateMany({
        where: { orderId, method: 'COD', status: 'PENDING' },
        data: { status: 'PAID', paidAt: now, providerStatus: 'cash_collected' },
      })
      await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'PAID' } })
      await recordAudit(tx, audit, {
        action: 'payment.cod_collected',
        entityType: 'order',
        entityId: orderId,
        metadata: { amount: order.total },
      })
    }
    await enqueueEvent(tx, {
      type: 'ORDER_DELIVERED',
      payload: { orderId },
      aggregateType: 'order',
      aggregateId: orderId,
    })
  })
}
