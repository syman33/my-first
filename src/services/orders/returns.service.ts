import 'server-only'
import type { DbClient } from '@/db/client'
import { transactionWithRetry } from '@/db/transaction'
import { AppError, NotFoundError, OrderNotFoundError, ValidationError } from '@/lib/errors'
import {
  AWAITING_RECEIPT_STATUSES,
  canTransitionReturn,
  isWithinReturnWindow,
  linePaidAmount,
  proRataRefund,
  returnableQuantity,
  returnDeadline,
  type ReturnStatusCode,
} from '@/lib/orders/returns'
import type {
  ReturnCompletionInput,
  ReturnReceiptInput,
  ReturnRequestInput,
} from '@/schemas/returns'
import { type AuditContext, recordAudit } from '@/services/audit/audit.service'
import { enqueueEvent } from '@/services/events/outbox.service'
import { restock, type StockLine } from '@/services/inventory/inventory.service'
import { recordManualRefund, refundPayment } from '@/services/payments/payment.service'
import { getSettings } from '@/services/settings/settings.service'
import { storeYear } from '@/utils/time'
import { lockOrder } from './order-lifecycle.service'

/**
 * Returns (spec §106): a customer asks within the return window, staff
 * approve or reject, inspect what arrives (sellable units go back into
 * stock, damaged ones do not) and refund the pro-rata amount through the
 * original payment — or record the bank transfer for cash on delivery.
 * Every step locks the order, then the return, so steps never interleave.
 */

class ReturnNotAllowedError extends AppError {
  constructor(message: string, details: Record<string, unknown>) {
    super('RETURN_NOT_ALLOWED', message, { status: 422, details })
  }
}

class ReturnNotFoundError extends NotFoundError {
  constructor() {
    super('NOT_FOUND', 'Return not found')
  }
}

/** Customer-facing return numbers: RMA-2026-000042 (sequence-backed, never reused). */
export async function nextReturnNumber(tx: DbClient, now: Date = new Date()): Promise<string> {
  const rows = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('return_number_seq') AS n`
  const n = rows[0]?.n ?? 0n
  return `RMA-${storeYear(now)}-${n.toString().padStart(6, '0')}`
}

async function lockReturn(tx: DbClient, returnId: string) {
  const ref = await tx.returnRequest.findUnique({
    where: { id: returnId },
    select: { orderId: true },
  })
  if (!ref) throw new ReturnNotFoundError()
  const order = await lockOrder(tx, ref.orderId)
  await tx.$queryRaw`SELECT id FROM return_requests WHERE id = ${returnId}::uuid FOR UPDATE`
  const request = await tx.returnRequest.findUniqueOrThrow({
    where: { id: returnId },
    include: { items: { include: { orderItem: true }, orderBy: { id: 'asc' } } },
  })
  return { request, order }
}

function assertTransition(from: ReturnStatusCode, to: ReturnStatusCode): void {
  if (!canTransitionReturn(from, to)) {
    throw new AppError('CONFLICT', `Return cannot move from ${from} to ${to}`, {
      status: 409,
      details: { from, to },
    })
  }
}

/** Units of each order line claimed by returns that have not reached the warehouse. */
async function awaitingReceipt(tx: DbClient, orderId: string): Promise<Map<string, number>> {
  const rows = await tx.returnItem.groupBy({
    by: ['orderItemId'],
    where: { returnRequest: { orderId, status: { in: [...AWAITING_RECEIPT_STATUSES] } } },
    _sum: { quantity: true },
  })
  return new Map(rows.map((row) => [row.orderItemId, row._sum.quantity ?? 0]))
}

export interface ReturnableLine {
  orderItemId: string
  returnableQuantity: number
}

/** What a customer may still return from an order right now (empty when nothing). */
export async function returnableLines(
  tx: DbClient,
  order: { id: string; status: string; deliveredAt: Date | null },
  now: Date = new Date(),
): Promise<{ deadline: Date | null; lines: ReturnableLine[] }> {
  const settings = await getSettings('returns', tx)
  const deadline = returnDeadline(order.deliveredAt, settings.windowDays)
  if (
    !settings.enabled ||
    order.status !== 'DELIVERED' ||
    !deadline ||
    !isWithinReturnWindow(order.deliveredAt, settings.windowDays, now)
  ) {
    return { deadline: null, lines: [] }
  }
  const [items, claimed] = await Promise.all([
    tx.orderItem.findMany({
      where: { orderId: order.id },
      select: { id: true, quantity: true, returnedQuantity: true },
      orderBy: { createdAt: 'asc' },
    }),
    awaitingReceipt(tx, order.id),
  ])
  return {
    deadline,
    lines: items
      .map((item) => ({
        orderItemId: item.id,
        returnableQuantity: returnableQuantity(item, claimed.get(item.id) ?? 0),
      }))
      .filter((line) => line.returnableQuantity > 0),
  }
}

/** A customer asks to return some units of a delivered order. */
export async function requestReturn(
  userId: string,
  orderId: string,
  input: ReturnRequestInput,
  audit: AuditContext,
  now: Date = new Date(),
): Promise<{ returnId: string; returnNumber: string }> {
  return transactionWithRetry('return.request', async (tx) => {
    const order = await lockOrder(tx, orderId)
    if (order.userId !== userId) throw new OrderNotFoundError()
    const settings = await getSettings('returns', tx)
    if (!settings.enabled)
      throw new ReturnNotAllowedError('Returns are not accepted', { reason: 'DISABLED' })
    if (order.status !== 'DELIVERED')
      throw new ReturnNotAllowedError('Only delivered orders can be returned', {
        reason: 'NOT_DELIVERED',
      })
    if (!isWithinReturnWindow(order.deliveredAt, settings.windowDays, now))
      throw new ReturnNotAllowedError('The return window has closed', { reason: 'WINDOW_CLOSED' })

    const { lines } = await returnableLines(tx, order, now)
    const available = new Map(lines.map((line) => [line.orderItemId, line.returnableQuantity]))
    const owned = new Set(order.items.map((item) => item.id))
    const shortages: { orderItemId: string; requested: number; available: number }[] = []
    for (const line of input.items) {
      if (!owned.has(line.orderItemId))
        throw new ValidationError({ items: 'invalid' }, 'Item is not part of this order')
      const max = available.get(line.orderItemId) ?? 0
      if (line.quantity > max)
        shortages.push({ orderItemId: line.orderItemId, requested: line.quantity, available: max })
    }
    if (shortages.length > 0)
      throw new ReturnNotAllowedError('More units than can be returned', {
        reason: 'QUANTITY',
        items: shortages,
      })

    const returnNumber = await nextReturnNumber(tx, now)
    const request = await tx.returnRequest.create({
      data: {
        returnNumber,
        orderId,
        userId,
        reason: input.reason,
        customerNote: input.note,
        items: {
          create: input.items.map((line) => ({
            orderItemId: line.orderItemId,
            quantity: line.quantity,
          })),
        },
      },
      select: { id: true, returnNumber: true },
    })
    await enqueueEvent(tx, {
      type: 'RETURN_REQUESTED',
      payload: { returnRequestId: request.id },
      aggregateType: 'return',
      aggregateId: request.id,
    })
    await recordAudit(tx, audit, {
      action: 'return.requested',
      entityType: 'return',
      entityId: request.id,
      metadata: { orderNumber: order.orderNumber, returnNumber, reason: input.reason },
    })
    return { returnId: request.id, returnNumber: request.returnNumber }
  })
}

/**
 * Withdraw a return before the parcel reaches the warehouse — by its
 * customer (`byCustomerId`) or by staff when it never arrived.
 */
export async function cancelReturn(
  returnId: string,
  options: { audit: AuditContext; note?: string | null; byCustomerId?: string },
): Promise<void> {
  await transactionWithRetry('return.cancel', async (tx) => {
    const { request, order } = await lockReturn(tx, returnId)
    if (options.byCustomerId && request.userId !== options.byCustomerId)
      throw new ReturnNotFoundError()
    // Once approved, the parcel may already be on its way: only staff can withdraw it then.
    if (options.byCustomerId && request.status !== 'REQUESTED')
      throw new ReturnNotAllowedError('This return can no longer be withdrawn', {
        reason: 'ALREADY_REVIEWED',
      })
    assertTransition(request.status, 'CANCELLED')
    await tx.returnRequest.update({
      where: { id: request.id },
      data: {
        status: 'CANCELLED',
        adminNote: options.byCustomerId ? request.adminNote : (options.note ?? request.adminNote),
      },
    })
    await recordAudit(tx, options.audit, {
      action: 'return.cancelled',
      entityType: 'return',
      entityId: request.id,
      metadata: {
        orderNumber: order.orderNumber,
        returnNumber: request.returnNumber,
        byCustomer: Boolean(options.byCustomerId),
      },
    })
  })
}

async function review(
  returnId: string,
  to: 'APPROVED' | 'REJECTED',
  note: string | null,
  audit: AuditContext,
): Promise<void> {
  await transactionWithRetry(`return.${to.toLowerCase()}`, async (tx) => {
    const { request, order } = await lockReturn(tx, returnId)
    assertTransition(request.status, to)
    await tx.returnRequest.update({
      where: { id: request.id },
      data: { status: to, adminNote: note, reviewedById: audit.actor.id, reviewedAt: new Date() },
    })
    await enqueueEvent(tx, {
      type: to === 'APPROVED' ? 'RETURN_APPROVED' : 'RETURN_REJECTED',
      payload: { returnRequestId: request.id },
      aggregateType: 'return',
      aggregateId: request.id,
    })
    await recordAudit(tx, audit, {
      action: `return.${to.toLowerCase()}`,
      entityType: 'return',
      entityId: request.id,
      metadata: { orderNumber: order.orderNumber, returnNumber: request.returnNumber, note },
    })
  })
}

export async function approveReturn(
  returnId: string,
  input: { note: string | null },
  audit: AuditContext,
): Promise<void> {
  await review(returnId, 'APPROVED', input.note, audit)
}

/** A rejection always carries the reason shown to the customer. */
export async function rejectReturn(
  returnId: string,
  input: { note: string },
  audit: AuditContext,
): Promise<void> {
  await review(returnId, 'REJECTED', input.note, audit)
}

/**
 * The parcel arrived and was inspected. Sellable units go back into stock
 * (RETURN_RESTOCK in the ledger); damaged units are recorded but not
 * restocked. Every item of the return must be inspected.
 */
export async function receiveReturn(
  returnId: string,
  input: ReturnReceiptInput,
  audit: AuditContext,
): Promise<void> {
  await transactionWithRetry('return.receive', async (tx) => {
    const { request, order } = await lockReturn(tx, returnId)
    assertTransition(request.status, 'RECEIVED')
    const conditions = new Map(input.items.map((item) => [item.returnItemId, item.condition]))
    const expected = new Set(request.items.map((item) => item.id))
    if (
      conditions.size !== input.items.length ||
      conditions.size !== expected.size ||
      [...conditions.keys()].some((id) => !expected.has(id))
    ) {
      throw new ValidationError({ items: 'invalid' }, 'Inspect every item of the return once')
    }

    const toRestock: StockLine[] = []
    for (const item of request.items) {
      const condition = conditions.get(item.id) ?? 'DAMAGED'
      // A deleted variant has no stock record to return units to.
      const restockable = condition === 'SELLABLE' && item.orderItem.variantId !== null
      if (restockable && item.orderItem.variantId) {
        toRestock.push({
          variantId: item.orderItem.variantId,
          sku: item.orderItem.sku,
          quantity: item.quantity,
        })
      }
      await tx.returnItem.update({
        where: { id: item.id },
        data: { condition, restockedQuantity: restockable ? item.quantity : 0 },
      })
      // CHECK (returned_quantity <= quantity) guards against over-returning.
      await tx.orderItem.update({
        where: { id: item.orderItemId },
        data: { returnedQuantity: { increment: item.quantity } },
      })
    }
    if (toRestock.length > 0) {
      await restock(tx, toRestock, 'RETURN_RESTOCK', {
        orderId: order.id,
        returnRequestId: request.id,
        reason: `Return ${request.returnNumber} received in sellable condition`,
        actorType: audit.actor.type,
        actorId: audit.actor.id,
      })
    }
    await tx.returnRequest.update({
      where: { id: request.id },
      data: {
        status: 'RECEIVED',
        receivedAt: new Date(),
        adminNote: input.note ?? request.adminNote,
      },
    })
    await recordAudit(tx, audit, {
      action: 'return.received',
      entityType: 'return',
      entityId: request.id,
      metadata: {
        orderNumber: order.orderNumber,
        returnNumber: request.returnNumber,
        restocked: toRestock.map((line) => ({ sku: line.sku, quantity: line.quantity })),
      },
    })
  })
}

export interface ReturnRefundQuote {
  /** Pro-rata amount paid for the returned units (VAT included). */
  suggested: number
  /** Still refundable on the captured payment (after earlier and in-flight refunds). */
  refundable: number
  paymentId: string | null
  /** Cash on delivery is refunded by bank transfer. */
  manual: boolean
}

async function quoteInTx(
  tx: DbClient,
  request: Awaited<ReturnType<typeof lockReturn>>['request'],
  order: Awaited<ReturnType<typeof lockReturn>>['order'],
): Promise<ReturnRefundQuote> {
  // Units of each line refunded by earlier completed returns.
  const completed = await tx.returnItem.groupBy({
    by: ['orderItemId'],
    where: {
      orderItemId: { in: request.items.map((item) => item.orderItemId) },
      returnRequest: { status: 'COMPLETED', id: { not: request.id } },
    },
    _sum: { quantity: true },
  })
  const before = new Map(completed.map((row) => [row.orderItemId, row._sum.quantity ?? 0]))
  let suggested = 0
  for (const item of request.items) {
    suggested += proRataRefund(
      linePaidAmount(item.orderItem, order.pricesIncludeTax),
      item.orderItem.quantity,
      before.get(item.orderItemId) ?? 0,
      item.quantity,
    )
  }
  const payment = await tx.payment.findFirst({
    where: { orderId: order.id, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, amount: true, refundedAmount: true, provider: true },
  })
  if (!payment) return { suggested, refundable: 0, paymentId: null, manual: false }
  const pending = await tx.refund.aggregate({
    where: { paymentId: payment.id, status: 'PENDING' },
    _sum: { amount: true },
  })
  return {
    suggested,
    refundable: Math.max(payment.amount - payment.refundedAmount - (pending._sum.amount ?? 0), 0),
    paymentId: payment.id,
    manual: payment.provider === 'cod',
  }
}

/** The refund a received return would get (for the admin completion form). */
export async function quoteReturnRefund(returnId: string): Promise<ReturnRefundQuote> {
  return transactionWithRetry('return.quote', async (tx) => {
    const { request, order } = await lockReturn(tx, returnId)
    return quoteInTx(tx, request, order)
  })
}

export type ReturnCompletion =
  | { status: 'COMPLETED'; refundId: string | null; amount: number }
  | { status: 'REFUND_PENDING'; refundId: string; amount: number }

/**
 * Refund a received return and close it. The refund goes through the
 * payments service (idempotent per attempt), so a retry after a crash
 * never refunds twice; a failed provider refund leaves the return RECEIVED
 * to be retried.
 */
export async function completeReturn(
  returnId: string,
  input: ReturnCompletionInput,
  audit: AuditContext,
): Promise<ReturnCompletion> {
  const prepared = await transactionWithRetry('return.complete.prepare', async (tx) => {
    const { request, order } = await lockReturn(tx, returnId)
    assertTransition(request.status, 'COMPLETED')
    const quote = await quoteInTx(tx, request, order)
    const amount = input.amount ?? Math.min(quote.suggested, quote.refundable)
    if (amount !== quote.suggested && !input.note)
      throw new ValidationError({ note: 'required' }, 'Explain why the refund differs')
    if (amount > 0 && !quote.paymentId)
      throw new AppError('REFUND_NOT_ALLOWED', 'The order has no captured payment to refund', {
        status: 409,
      })
    if (amount > 0 && quote.manual && !input.transferReference)
      throw new ValidationError(
        { transferReference: 'required' },
        'Cash-on-delivery refunds need the bank transfer reference',
      )
    // One key per attempt: a failed refund may be retried, a successful one never repeats.
    const failedAttempts = await tx.refund.count({
      where: { returnRequestId: request.id, status: 'FAILED' },
    })
    return {
      amount,
      quote,
      returnNumber: request.returnNumber,
      idempotencyKey: `return:${request.id}:${failedAttempts + 1}`,
    }
  })

  let refundId: string | null = null
  if (prepared.amount > 0 && prepared.quote.paymentId) {
    const reason = `Return ${prepared.returnNumber}`
    const outcome = prepared.quote.manual
      ? await recordManualRefund(
          prepared.quote.paymentId,
          {
            amount: prepared.amount,
            reason,
            reference: input.transferReference ?? '',
            idempotencyKey: prepared.idempotencyKey,
            returnRequestId: returnId,
          },
          audit,
        )
      : await refundPayment(
          prepared.quote.paymentId,
          {
            amount: prepared.amount,
            reason,
            idempotencyKey: prepared.idempotencyKey,
            returnRequestId: returnId,
          },
          audit,
        )
    if (outcome.status === 'FAILED')
      throw new AppError('PROVIDER_ERROR', 'The payment provider declined the refund', {
        status: 502,
        details: { refundId: outcome.refundId },
      })
    if (outcome.status === 'PENDING')
      return { status: 'REFUND_PENDING', refundId: outcome.refundId, amount: prepared.amount }
    refundId = outcome.refundId
  }

  await transactionWithRetry('return.complete', async (tx) => {
    const { request, order } = await lockReturn(tx, returnId)
    if (request.status === 'COMPLETED') return
    assertTransition(request.status, 'COMPLETED')
    await tx.returnRequest.update({
      where: { id: request.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        adminNote: input.note ?? request.adminNote,
      },
    })
    await enqueueEvent(tx, {
      type: 'RETURN_COMPLETED',
      payload: { returnRequestId: request.id, refundId },
      aggregateType: 'return',
      aggregateId: request.id,
    })
    await recordAudit(tx, audit, {
      action: 'return.completed',
      entityType: 'return',
      entityId: request.id,
      metadata: {
        orderNumber: order.orderNumber,
        returnNumber: request.returnNumber,
        amount: prepared.amount,
        suggested: prepared.quote.suggested,
        refundId,
      },
    })
  })
  return { status: 'COMPLETED', refundId, amount: prepared.amount }
}
