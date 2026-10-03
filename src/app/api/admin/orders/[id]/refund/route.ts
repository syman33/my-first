import { prisma } from '@/db/client'
import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { AppError, OrderNotFoundError, ValidationError } from '@/lib/errors'
import { readIdempotencyKey } from '@/lib/idempotency'
import { refundSchema } from '@/schemas/admin-orders'
import { processPendingEvents } from '@/services/events/process'
import { recordManualRefund, refundPayment } from '@/services/payments/payment.service'

/**
 * Refund part or all of a captured payment. Online payments go back through
 * the provider; cash-on-delivery refunds are recorded with the bank transfer
 * reference. The Idempotency-Key makes a retried click refund once.
 */
export const POST = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'ORDERS_REFUND', rateLimit: adminWriteLimit },
  async (ctx) => {
    const orderId = routeId(ctx.params.id, new OrderNotFoundError())
    const key = readIdempotencyKey(ctx.req.headers)
    const input = await ctx.body(refundSchema)
    const payment = await prisma.payment.findUnique({
      where: { id: input.paymentId },
      select: { orderId: true, provider: true },
    })
    if (!payment || payment.orderId !== orderId)
      throw new AppError('PAYMENT_NOT_FOUND', 'Payment not found', { status: 404 })
    const request = {
      amount: input.amount,
      reason: input.reason,
      idempotencyKey: `admin-refund:${input.paymentId}:${key}`,
    }
    let outcome
    if (payment.provider === 'cod') {
      if (!input.reference)
        throw new ValidationError({ reference: 'required' }, 'Transfer reference required')
      outcome = await recordManualRefund(
        input.paymentId,
        { ...request, reference: input.reference },
        ctx.audit,
      )
    } else {
      outcome = await refundPayment(input.paymentId, request, ctx.audit)
    }
    ctx.afterResponse(() => processPendingEvents())
    return ok({ refund: outcome })
  },
)
