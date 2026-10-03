import 'server-only'
import { prisma, type DbClient } from '@/db/client'
import { isRetryableTransactionError, isUniqueViolation } from '@/db/errors'
import type { Locale } from '@/i18n/config'
import { AppError, InvalidCouponError, NotFoundError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { allocateProportionally, addMoney } from '@/utils/money'
import { addMinutes } from '@/utils/time'
import type { CheckoutInput } from '@/schemas/checkout'
import { type AuditContext, recordAudit } from '@/services/audit/audit.service'
import { priceCart } from '@/services/cart/cart.service'
import { enqueueEvent } from '@/services/events/outbox.service'
import { reserveStock } from '@/services/inventory/inventory.service'
import { configuredPaymentProvider, paymentMethodOptions } from '@/services/payments/methods'
import { getSettings } from '@/services/settings/settings.service'
import { nextOrderNumber } from './order-number'

export interface PlacedOrder {
  [key: string]: string | number
  orderId: string
  orderNumber: string
  total: number
  paymentMethod: string
  /** 'pay': redirect to the payment step; 'confirmation': nothing to pay online (COD). */
  next: 'pay' | 'confirmation'
}

export interface PlaceOrderContext {
  user: { id: string; email: string; emailVerified: boolean }
  locale: Locale
  idempotencyKey: string
  audit: AuditContext
  now?: Date
}

const MAX_ATTEMPTS = 3

async function resolveShippingAddress(
  tx: DbClient,
  userId: string,
  input: CheckoutInput['address'],
) {
  if (input.type === 'saved') {
    const address = await tx.address.findFirst({ where: { id: input.addressId, userId } })
    if (!address) throw new NotFoundError('ADDRESS_NOT_FOUND', 'Address not found')
    return address
  }
  if (input.save) {
    const count = await tx.address.count({ where: { userId } })
    if (count < 20) {
      return tx.address.create({
        data: { ...input.address, userId, isDefault: input.address.isDefault || count === 0 },
      })
    }
  }
  return input.address
}

/**
 * Create an order from the customer's bag (spec §33). One transaction:
 * re-price from the database, validate methods and the shown total, reserve
 * stock, consume the coupon, write the order with item snapshots, its status
 * history, the payment record, the outbox event and the audit entry, then
 * empty the bag. Any failure rolls everything back.
 */
export async function placeOrder(
  input: CheckoutInput,
  ctx: PlaceOrderContext,
): Promise<PlacedOrder> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await placeOrderOnce(input, ctx)
    } catch (error) {
      if (isUniqueViolation(error, 'idempotency_key')) {
        // A previous attempt with this key already created the order.
        const existing = await prisma.order.findUnique({
          where: { idempotencyKey: `checkout:${ctx.user.id}:${ctx.idempotencyKey}` },
          select: { id: true, orderNumber: true, total: true, paymentMethod: true },
        })
        if (existing) {
          return {
            orderId: existing.id,
            orderNumber: existing.orderNumber,
            total: existing.total,
            paymentMethod: existing.paymentMethod,
            next: existing.paymentMethod === 'COD' ? 'confirmation' : 'pay',
          }
        }
      }
      if (attempt < MAX_ATTEMPTS && isRetryableTransactionError(error)) {
        logger.warn('checkout.retry', { attempt })
        continue
      }
      throw error
    }
  }
}

async function placeOrderOnce(input: CheckoutInput, ctx: PlaceOrderContext): Promise<PlacedOrder> {
  const now = ctx.now ?? new Date()
  const owner = { userId: ctx.user.id }
  return prisma.$transaction(
    async (tx) => {
      const priced = await priceCart(tx, owner, ctx.locale, {
        userId: ctx.user.id,
        shippingMethod: input.shippingMethod,
        paymentMethod: input.paymentMethod,
        now,
      })
      const { view, rows, settings } = priced
      if (!view.id || view.totals.itemCount === 0)
        throw new AppError('CART_EMPTY', 'Cart is empty', { status: 422 })
      if (view.hasIssues) {
        throw new AppError('CART_CHANGED', 'Some items changed; review the bag', {
          status: 409,
          details: { reason: 'ITEMS' },
        })
      }
      if (view.couponIssue) {
        throw new InvalidCouponError(
          view.couponIssue.reason,
          view.couponIssue.minOrderAmount !== undefined
            ? { minOrderAmount: view.couponIssue.minOrderAmount }
            : {},
        )
      }
      if (settings.checkout.requireEmailVerification && !ctx.user.emailVerified) {
        throw new AppError('EMAIL_NOT_VERIFIED', 'Email address not confirmed', { status: 403 })
      }
      if (input.shippingMethod === 'EXPRESS' && !settings.shipping.expressEnabled) {
        throw new AppError('SHIPPING_METHOD_UNAVAILABLE', 'Express delivery is not offered', {
          status: 422,
        })
      }
      const payments = await getSettings('payments', tx)
      const option = paymentMethodOptions(payments, settings.cod, view.totals).find(
        (o) => o.method === input.paymentMethod,
      )
      if (!option?.available) {
        throw new AppError(
          'PAYMENT_METHOD_UNAVAILABLE',
          'Payment method not available for this order',
          { status: 422 },
        )
      }
      const { totals } = view
      if (totals.total !== input.expectedTotal) {
        // Prices, fees or discounts changed since the customer looked: never charge an unseen amount.
        throw new AppError('CART_CHANGED', 'The order total changed', {
          status: 409,
          details: { reason: 'TOTAL', total: totals.total },
        })
      }

      const address = await resolveShippingAddress(tx, ctx.user.id, input.address)
      const orderNumber = await nextOrderNumber(tx, now)
      const isCod = input.paymentMethod === 'COD'
      const reservationExpiresAt = isCod
        ? null
        : addMinutes(now, settings.checkout.reservationMinutes)

      // Per-line tax for invoice lines: the order's VAT spread over lines and taxable fees.
      const lineTotals = totals.lines.map((line) => line.total)
      const taxableFees = settings.tax.shippingTaxable
        ? addMoney(totals.shippingTotal, totals.codFee)
        : 0
      const lineTaxes = allocateProportionally(totals.taxTotal, [...lineTotals, taxableFees]).slice(
        0,
        lineTotals.length,
      )

      // No line has an issue at this point, so every row is priced; match lines by variant.
      const pricedByVariant = new Map(
        totals.lines.map((line, index) => [line.variantId, { line, tax: lineTaxes[index] ?? 0 }]),
      )
      const viewByItem = new Map(view.lines.map((line) => [line.id, line]))
      const order = await tx.order.create({
        data: {
          orderNumber,
          userId: ctx.user.id,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          paymentMethod: input.paymentMethod,
          inventoryStatus: 'RESERVED',
          shippingMethod: input.shippingMethod,
          locale: ctx.locale,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          shippingTotal: totals.shippingTotal,
          codFee: totals.codFee,
          taxTotal: totals.taxTotal,
          total: totals.total,
          pricesIncludeTax: totals.pricesIncludeTax,
          taxRateBps: totals.taxRateBps,
          couponId: priced.coupon?.couponId ?? null,
          couponCode: priced.coupon?.code ?? null,
          shippingName: address.fullName,
          shippingPhone: address.phone,
          shippingEmail: ctx.user.email,
          shippingCity: address.city,
          shippingDistrict: address.district,
          shippingStreet: address.street,
          shippingBuilding: address.buildingNumber,
          shippingPostalCode: address.postalCode,
          shippingAdditionalNo: address.additionalNumber ?? null,
          shippingInstructions: address.instructions ?? null,
          customerNote: input.customerNote,
          reservationExpiresAt,
          idempotencyKey: `checkout:${ctx.user.id}:${ctx.idempotencyKey}`,
          items: {
            create: rows.map((row) => {
              const priced = pricedByVariant.get(row.variant.id)
              if (!priced)
                throw new AppError('CART_CHANGED', 'Bag changed during checkout', { status: 409 })
              const lineView = viewByItem.get(row.id)
              const product = row.variant.product
              return {
                productId: product.id,
                variantId: row.variant.id,
                productNameAr: product.nameAr,
                productNameEn: product.nameEn,
                variantNameAr: row.variant.nameAr,
                variantNameEn: row.variant.nameEn,
                productSlugAr: product.slugAr,
                productSlugEn: product.slugEn,
                sku: row.variant.sku,
                imageUrl: lineView?.image?.url ?? null,
                unitPrice: priced.line.unitPrice,
                compareAtPrice: lineView?.compareAtPrice ?? null,
                quantity: priced.line.quantity,
                lineSubtotal: priced.line.subtotal,
                discountAmount: priced.line.discount,
                taxAmount: priced.tax,
                lineTotal: priced.line.total,
              }
            }),
          },
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: 'PENDING',
              actorType: 'CUSTOMER',
              actorId: ctx.user.id,
            },
          },
          payments: {
            create: {
              provider: isCod ? 'cod' : configuredPaymentProvider(),
              method: input.paymentMethod,
              status: 'PENDING',
              amount: totals.total,
              expiresAt: reservationExpiresAt,
            },
          },
        },
        select: { id: true, orderNumber: true, total: true },
      })

      await reserveStock(
        tx,
        rows.map((row) => ({
          variantId: row.variant.id,
          sku: row.variant.sku,
          quantity: row.quantity,
        })),
        {
          orderId: order.id,
          reason: `Order ${orderNumber}`,
          actorType: 'CUSTOMER',
          actorId: ctx.user.id,
        },
      )

      if (priced.coupon) {
        // Serialise concurrent checkouts of the same customer with the same code (per-customer limits).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`coupon:${priced.coupon.couponId}:${ctx.user.id}`}))`
        const coupon = await tx.coupon.findUniqueOrThrow({
          where: { id: priced.coupon.couponId },
          select: { usageLimitPerUser: true },
        })
        if (coupon.usageLimitPerUser !== null) {
          const used = await tx.couponUsage.count({
            where: { couponId: priced.coupon.couponId, userId: ctx.user.id },
          })
          if (used >= coupon.usageLimitPerUser) throw new InvalidCouponError('USER_LIMIT_REACHED')
        }
        // Global limit: conditional increment, so the last use cannot be taken twice.
        const consumed = await tx.$executeRaw`
          UPDATE coupons SET used_count = used_count + 1, updated_at = now()
           WHERE id = ${priced.coupon.couponId}::uuid AND (usage_limit IS NULL OR used_count < usage_limit)`
        if (consumed === 0) throw new InvalidCouponError('USAGE_LIMIT_REACHED')
        await tx.couponUsage.create({
          data: {
            couponId: priced.coupon.couponId,
            userId: ctx.user.id,
            orderId: order.id,
            discountAmount: totals.discountTotal,
          },
        })
      }

      await tx.cartItem.deleteMany({ where: { cartId: view.id } })
      await tx.cart.update({ where: { id: view.id }, data: { couponCode: null } })

      await enqueueEvent(tx, {
        type: 'ORDER_PLACED',
        payload: { orderId: order.id },
        aggregateType: 'order',
        aggregateId: order.id,
      })
      await recordAudit(tx, ctx.audit, {
        action: 'order.created',
        entityType: 'order',
        entityId: order.id,
        metadata: {
          orderNumber,
          total: order.total,
          items: totals.itemCount,
          paymentMethod: input.paymentMethod,
        },
      })

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        total: order.total,
        paymentMethod: input.paymentMethod,
        next: isCod ? 'confirmation' : 'pay',
      }
    },
    { timeout: 20_000, maxWait: 10_000 },
  )
}
