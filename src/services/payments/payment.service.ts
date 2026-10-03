import 'server-only'
import { prisma, type DbClient } from '@/db/client'
import { isUniqueViolation } from '@/db/errors'
import type { Prisma } from '@/generated/prisma/client'
import type { Locale } from '@/i18n/config'
import { AppError, OrderNotFoundError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { emitAlert } from '@/lib/monitoring'
import { type AuditContext, recordAudit, SYSTEM_ACTOR } from '@/services/audit/audit.service'
import { enqueueEvent } from '@/services/events/outbox.service'
import { cancelOrderInTx, confirmOrderInTx } from '@/services/orders/order-lifecycle.service'
import { getSettings } from '@/services/settings/settings.service'
import type { ProviderPaymentState } from './provider'
import { getPaymentProvider, providerByName } from './registry'
import type { ProviderName } from './provider'

/**
 * Payment lifecycle. A payment is marked PAID only from information the
 * server verified with the provider (a signed webhook or a server-to-server
 * status check) after checking provider, payment id, order, amount, currency
 * and state (spec §39). Every application of a provider result is
 * idempotent, so duplicates and replays change nothing.
 */

function appUrl(path: string): string {
  return `${(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')}${path}`
}

/** Start or resume the online payment of a pending order; returns the provider's page. */
export async function initiatePayment(
  orderId: string,
  userId: string,
  locale: Locale,
  now: Date = new Date(),
): Promise<{ redirectUrl: string }> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: {
      payments: { where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })
  if (!order) throw new OrderNotFoundError()
  if (order.paymentMethod === 'COD') {
    throw new AppError('PAYMENT_METHOD_UNAVAILABLE', 'Cash on delivery needs no online payment', {
      status: 409,
    })
  }
  if (order.paymentStatus === 'PAID')
    throw new AppError('PAYMENT_ALREADY_COMPLETED', 'Order already paid', { status: 409 })
  const payment = order.payments[0]
  if (
    order.status !== 'PENDING' ||
    !payment ||
    !order.reservationExpiresAt ||
    order.reservationExpiresAt <= now
  ) {
    throw new AppError('PAYMENT_FAILED', 'This order can no longer be paid', { status: 409 })
  }

  const provider = getPaymentProvider()
  // Resume an already-created provider session instead of creating a second charge.
  if (payment.providerPaymentId && payment.redirectUrl && payment.provider === provider.name) {
    return { redirectUrl: payment.redirectUrl }
  }

  const result = await provider.createPayment({
    paymentId: payment.id,
    orderId: order.id,
    orderNumber: order.orderNumber,
    amount: payment.amount,
    currency: 'SAR',
    method: payment.method,
    description: `VÉLORA ${order.orderNumber}`,
    callbackUrl: appUrl(`/${locale}/checkout/return?payment=${payment.id}`),
    locale,
  })
  const updated = await prisma.payment.updateMany({
    where: { id: payment.id, status: 'PENDING', providerPaymentId: null },
    data: {
      provider: provider.name,
      providerPaymentId: result.providerPaymentId,
      redirectUrl: result.redirectUrl,
      providerStatus: 'initiated',
    },
  })
  if (updated.count === 0) {
    // A concurrent request attached a session first: use that one.
    const current = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
      select: { redirectUrl: true },
    })
    if (!current.redirectUrl)
      throw new AppError('CONFLICT', 'Payment state changed', { status: 409 })
    return { redirectUrl: current.redirectUrl }
  }
  return { redirectUrl: result.redirectUrl }
}

export type ApplyOutcome =
  | 'paid'
  | 'already_paid'
  | 'paid_after_cancellation'
  | 'failed'
  | 'cancelled'
  | 'pending'
  | 'ignored'
  | 'rejected'

/** Put a cancelled order's items back in the customer's bag so they can try again. */
async function restoreCart(tx: DbClient, orderId: string): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      userId: true,
      couponCode: true,
      items: { select: { variantId: true, quantity: true } },
    },
  })
  const { maxQuantityPerItem } = await getSettings('checkout', tx)
  const cart = await tx.cart.upsert({
    where: { userId: order.userId },
    create: { userId: order.userId, couponCode: order.couponCode },
    update: {},
    select: { id: true },
  })
  for (const item of order.items) {
    if (!item.variantId) continue
    await tx.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: item.variantId } },
      create: {
        cartId: cart.id,
        variantId: item.variantId,
        quantity: Math.min(item.quantity, maxQuantityPerItem),
      },
      update: {},
    })
  }
}

/**
 * Apply a verified provider state to our payment and order. Runs in one
 * transaction with the order row locked (via the lifecycle functions).
 */
export async function applyProviderState(
  provider: ProviderName,
  state: ProviderPaymentState,
  audit: AuditContext = { actor: SYSTEM_ACTOR },
): Promise<{ outcome: ApplyOutcome; paymentId: string | null; reason?: string }> {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: {
        provider_providerPaymentId: { provider, providerPaymentId: state.providerPaymentId },
      },
      include: {
        order: { select: { id: true, orderNumber: true, status: true, paymentStatus: true } },
      },
    })
    if (!payment) return { outcome: 'ignored' as const, paymentId: null, reason: 'UNKNOWN_PAYMENT' }
    // Lock the order first: a concurrent reservation expiry or cancellation must finish (or wait).
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${payment.orderId}::uuid FOR UPDATE`
    payment.order = await tx.order.findUniqueOrThrow({
      where: { id: payment.orderId },
      select: { id: true, orderNumber: true, status: true, paymentStatus: true },
    })

    // Cross-check everything the provider tells us against our own records.
    const mismatch =
      (state.orderId !== null && state.orderId !== payment.orderId) ||
      (state.paymentId !== null && state.paymentId !== payment.id)
        ? 'ORDER_MISMATCH'
        : state.currency.toUpperCase() !== payment.currency
          ? 'CURRENCY_MISMATCH'
          : state.amount !== payment.amount
            ? 'AMOUNT_MISMATCH'
            : null
    if (mismatch) {
      await tx.order.update({ where: { id: payment.orderId }, data: { attentionReason: mismatch } })
      await recordAudit(tx, audit, {
        action: 'payment.rejected',
        entityType: 'payment',
        entityId: payment.id,
        metadata: {
          reason: mismatch,
          reportedAmount: state.amount,
          reportedCurrency: state.currency,
        },
      })
      emitAlert('payment.amount_mismatch', {
        paymentId: payment.id,
        orderNumber: payment.order.orderNumber,
        reason: mismatch,
      })
      return { outcome: 'rejected' as const, paymentId: payment.id, reason: mismatch }
    }

    if (
      payment.status === 'PAID' ||
      payment.status === 'REFUNDED' ||
      payment.status === 'PARTIALLY_REFUNDED'
    ) {
      return { outcome: 'already_paid' as const, paymentId: payment.id }
    }

    const now = new Date()
    switch (state.status) {
      case 'PENDING':
        await tx.payment.update({
          where: { id: payment.id },
          data: { providerStatus: state.rawStatus },
        })
        return { outcome: 'pending' as const, paymentId: payment.id }

      case 'PAID': {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'PAID',
            paidAt: now,
            providerStatus: state.rawStatus,
            failureCode: null,
            failureMessage: null,
          },
        })
        if (payment.order.status === 'PENDING') {
          await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: 'PAID' } })
          await confirmOrderInTx(tx, payment.orderId, audit, 'Payment received')
          await enqueueEvent(tx, {
            type: 'PAYMENT_SUCCEEDED',
            payload: { orderId: payment.orderId, paymentId: payment.id },
            aggregateType: 'payment',
            aggregateId: payment.id,
          })
          await recordAudit(tx, audit, {
            action: 'payment.paid',
            entityType: 'payment',
            entityId: payment.id,
            metadata: { amount: payment.amount },
          })
          return { outcome: 'paid' as const, paymentId: payment.id }
        }
        // The money arrived after the order was cancelled (e.g. payment window expired):
        // keep the record truthful and flag it for refund — never silently keep it.
        await tx.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: 'PAID', attentionReason: 'PAID_AFTER_CANCELLATION' },
        })
        await recordAudit(tx, audit, {
          action: 'payment.paid_after_cancellation',
          entityType: 'payment',
          entityId: payment.id,
          metadata: { orderNumber: payment.order.orderNumber, amount: payment.amount },
        })
        emitAlert('payment.paid_after_cancellation', {
          paymentId: payment.id,
          orderNumber: payment.order.orderNumber,
        })
        return { outcome: 'paid_after_cancellation' as const, paymentId: payment.id }
      }

      case 'FAILED':
      case 'CANCELLED': {
        const failed = state.status === 'FAILED'
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: failed ? 'FAILED' : 'CANCELLED',
            failedAt: now,
            providerStatus: state.rawStatus,
            failureCode: state.failureCode ?? null,
            failureMessage: state.failureMessage?.slice(0, 500) ?? null,
          },
        })
        // Spec §31: failed/cancelled payments release the reserved stock.
        if (payment.order.status === 'PENDING') {
          await cancelOrderInTx(tx, payment.orderId, {
            audit,
            reason: failed ? 'PAYMENT_FAILED' : 'PAYMENT_CANCELLED',
          })
          await tx.order.update({
            where: { id: payment.orderId },
            data: { paymentStatus: failed ? 'FAILED' : 'CANCELLED' },
          })
          await restoreCart(tx, payment.orderId)
          await enqueueEvent(tx, {
            type: 'PAYMENT_FAILED',
            payload: { orderId: payment.orderId, paymentId: payment.id },
            aggregateType: 'payment',
            aggregateId: payment.id,
          })
        }
        return {
          outcome: failed ? ('failed' as const) : ('cancelled' as const),
          paymentId: payment.id,
        }
      }
    }
  })
}

export class InvalidWebhookError extends AppError {
  constructor(message: string) {
    super('WEBHOOK_SIGNATURE_INVALID', message, { status: 401 })
  }
}

/**
 * Webhook pipeline: authenticate → record the event (unique per provider +
 * event id, so duplicates and replays are dropped) → apply → mark processed.
 */
export async function handlePaymentWebhook(
  providerName: ProviderName,
  rawBody: string,
  headers: Headers,
): Promise<{ status: 'processed' | 'duplicate' | 'ignored' | 'rejected'; outcome?: ApplyOutcome }> {
  const provider = providerByName(providerName)
  let verified
  try {
    verified = await provider.verifyWebhook(rawBody, headers)
  } catch (error) {
    logger.warn('payments.webhook_unverified', {
      provider: providerName,
      reason: error instanceof Error ? error.message : 'unknown',
    })
    throw new InvalidWebhookError('Webhook could not be verified')
  }

  let eventRowId: string
  try {
    const row = await prisma.paymentWebhookEvent.create({
      data: {
        provider: providerName,
        eventId: verified.eventId,
        eventType: verified.type.slice(0, 64),
        providerPaymentId: verified.payment.providerPaymentId,
        payload: JSON.parse(rawBody) as Prisma.InputJsonValue,
      },
      select: { id: true },
    })
    eventRowId = row.id
  } catch (error) {
    if (isUniqueViolation(error)) return { status: 'duplicate' }
    throw error
  }

  try {
    const result = await applyProviderState(providerName, verified.payment)
    const status =
      result.outcome === 'ignored'
        ? 'IGNORED'
        : result.outcome === 'rejected'
          ? 'REJECTED'
          : 'PROCESSED'
    await prisma.paymentWebhookEvent.update({
      where: { id: eventRowId },
      data: {
        status,
        paymentId: result.paymentId,
        failureReason: result.reason ?? null,
        processedAt: new Date(),
      },
    })
    return {
      status: status === 'PROCESSED' ? 'processed' : status === 'IGNORED' ? 'ignored' : 'rejected',
      outcome: result.outcome,
    }
  } catch (error) {
    // Let the provider retry: the event row is removed so the retry is not mistaken for a duplicate.
    await prisma.paymentWebhookEvent
      .delete({ where: { id: eventRowId } })
      .catch((cleanupError: unknown) => {
        logger.error('payments.webhook_cleanup_failed', { eventRowId, error: cleanupError })
      })
    throw error
  }
}

/**
 * Customer returned from the payment page: ask the provider directly
 * (the redirect itself proves nothing) and apply the verified state.
 */
export async function reconcilePayment(
  paymentId: string,
  userId: string,
): Promise<{ orderId: string; orderNumber: string; status: string }> {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, order: { userId } },
    select: {
      id: true,
      provider: true,
      providerPaymentId: true,
      status: true,
      order: { select: { id: true, orderNumber: true } },
    },
  })
  if (!payment) throw new OrderNotFoundError()
  if (
    payment.status === 'PENDING' &&
    payment.providerPaymentId &&
    (payment.provider === 'mock' || payment.provider === 'moyasar')
  ) {
    try {
      const state = await providerByName(payment.provider).fetchPayment(payment.providerPaymentId)
      await applyProviderState(payment.provider, state)
    } catch (error) {
      // The webhook remains the source of truth; the page shows "processing".
      logger.warn('payments.reconcile_failed', { paymentId, error })
    }
  }
  const latest = await prisma.payment.findUniqueOrThrow({
    where: { id: payment.id },
    select: { status: true },
  })
  return {
    orderId: payment.order.id,
    orderNumber: payment.order.orderNumber,
    status: latest.status,
  }
}

/**
 * Refund (part of) a captured payment through its provider. The refund row
 * is written first (PENDING) so a provider timeout never loses track of it.
 */
export async function refundPayment(
  paymentId: string,
  input: {
    amount: number
    reason: string
    idempotencyKey?: string
    returnRequestId?: string | null
  },
  audit: AuditContext,
): Promise<{ refundId: string; status: 'SUCCEEDED' | 'PENDING' | 'FAILED' }> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      orderId: true,
      provider: true,
      providerPaymentId: true,
      status: true,
      amount: true,
      refundedAmount: true,
    },
  })
  if (!payment) throw new AppError('PAYMENT_NOT_FOUND', 'Payment not found', { status: 404 })
  if (payment.status !== 'PAID' && payment.status !== 'PARTIALLY_REFUNDED') {
    throw new AppError('REFUND_NOT_ALLOWED', 'Only captured payments can be refunded', {
      status: 409,
    })
  }
  const refundable = payment.amount - payment.refundedAmount
  if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > refundable) {
    throw new AppError('REFUND_NOT_ALLOWED', 'Refund amount exceeds the refundable balance', {
      status: 422,
      details: { refundable },
    })
  }
  if (payment.provider === 'cod') {
    throw new AppError(
      'REFUND_NOT_ALLOWED',
      'Cash payments are refunded outside the payment provider',
      { status: 409 },
    )
  }

  let refund
  try {
    refund = await prisma.refund.create({
      data: {
        orderId: payment.orderId,
        paymentId: payment.id,
        amount: input.amount,
        reason: input.reason.slice(0, 500),
        returnRequestId: input.returnRequestId ?? null,
        createdById: audit.actor.id,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    })
  } catch (error) {
    if (input.idempotencyKey && isUniqueViolation(error)) {
      const existing = await prisma.refund.findUniqueOrThrow({
        where: { idempotencyKey: input.idempotencyKey },
      })
      return { refundId: existing.id, status: existing.status }
    }
    throw error
  }

  const provider =
    payment.provider === 'mock' || payment.provider === 'moyasar'
      ? providerByName(payment.provider)
      : null
  const result =
    provider && payment.providerPaymentId
      ? await provider
          .refund({
            providerPaymentId: payment.providerPaymentId,
            amount: input.amount,
            reason: input.reason,
          })
          .catch((error: unknown) => ({
            providerRefundId: '',
            status: 'FAILED' as const,
            failureMessage: error instanceof Error ? error.message : 'Provider error',
          }))
      : {
          providerRefundId: '',
          status: 'FAILED' as const,
          failureMessage: 'Payment has no provider reference',
        }

  await prisma.$transaction(async (tx) => {
    await tx.refund.update({
      where: { id: refund.id },
      data: {
        status: result.status,
        providerRefundId: result.providerRefundId || null,
        failureMessage: 'failureMessage' in result ? (result.failureMessage ?? null) : null,
        completedAt: result.status === 'SUCCEEDED' ? new Date() : null,
      },
    })
    if (result.status === 'SUCCEEDED') {
      const refundedAmount = payment.refundedAmount + input.amount
      const full = refundedAmount === payment.amount
      await tx.payment.update({
        where: { id: payment.id },
        data: { refundedAmount, status: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
      })
      const order = await tx.order.findUniqueOrThrow({
        where: { id: payment.orderId },
        select: { attentionReason: true },
      })
      await tx.order.update({
        where: { id: payment.orderId },
        data: {
          paymentStatus: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          refundedAt: full ? new Date() : undefined,
          // A refund settles "refund required" flags.
          attentionReason:
            full &&
            (order.attentionReason === 'REFUND_REQUIRED' ||
              order.attentionReason === 'PAID_AFTER_CANCELLATION')
              ? null
              : order.attentionReason,
        },
      })
      await enqueueEvent(tx, {
        type: 'ORDER_REFUNDED',
        payload: { orderId: payment.orderId, refundId: refund.id },
        aggregateType: 'order',
        aggregateId: payment.orderId,
      })
    }
    await recordAudit(tx, audit, {
      action: `refund.${result.status.toLowerCase()}`,
      entityType: 'refund',
      entityId: refund.id,
      metadata: { paymentId: payment.id, amount: input.amount, reason: input.reason },
    })
  })
  return { refundId: refund.id, status: result.status }
}

/** After a paid order is cancelled before shipping, refund it in full automatically. */
export async function refundCancelledOrder(orderId: string, audit: AuditContext): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      attentionReason: true,
      payments: {
        where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } },
        select: { id: true, amount: true, refundedAmount: true },
      },
    },
  })
  if (!order || order.status !== 'CANCELLED') return
  for (const payment of order.payments) {
    const amount = payment.amount - payment.refundedAmount
    if (amount <= 0) continue
    const result = await refundPayment(
      payment.id,
      {
        amount,
        reason: 'Order cancelled before shipping',
        idempotencyKey: `cancel:${orderId}:${payment.id}`,
      },
      audit,
    )
    if (result.status !== 'SUCCEEDED') {
      emitAlert('refund.failed', { orderId, paymentId: payment.id })
    }
  }
}
