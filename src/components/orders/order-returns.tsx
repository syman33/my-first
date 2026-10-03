import Link from 'next/link'
import type { Route } from 'next'
import type { ReturnStatus } from '@/generated/prisma/enums'
import { type Dictionary, interpolate } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { formatDate, formatMoney } from '@/i18n/format'
import type { CustomerOrderDetail } from '@/types/orders'
import { cn } from '@/utils/cn'
import { ReturnRequestForm } from './return-request-form'
import { WithdrawReturnButton } from './withdraw-return-button'

const tone: Record<ReturnStatus, string> = {
  REQUESTED: 'bg-warning-soft text-warning',
  APPROVED: 'bg-champagne-soft text-champagne-strong',
  REJECTED: 'bg-danger-soft text-danger',
  RECEIVED: 'bg-sand text-ink',
  COMPLETED: 'bg-success-soft text-success',
  CANCELLED: 'bg-line text-text',
}

/** Returns on the customer's order page: existing requests and, while allowed, a new one. */
export function OrderReturns({
  locale,
  order,
  dict,
}: {
  locale: Locale
  order: CustomerOrderDetail
  dict: Dictionary
}) {
  const t = dict.orders.returns
  if (order.returns.length === 0 && !order.returnable) return null
  const itemsById = new Map(order.items.map((item) => [item.id, item]))

  return (
    <section aria-labelledby="order-returns" className="space-y-5" data-testid="order-returns">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 id="order-returns" className="text-sm font-medium text-ink">
          {t.title}
        </h3>
        <Link
          href={`/${locale}/returns` as Route}
          className="text-xs text-muted underline underline-offset-4 hover:text-ink"
        >
          {t.policy}
        </Link>
      </div>

      {order.returns.length > 0 ? (
        <ul className="space-y-4">
          {order.returns.map((request) => (
            <li key={request.id} className="space-y-3 border border-line p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="ltr-nums font-medium text-ink">
                  {interpolate(t.number, { number: request.returnNumber })}
                </p>
                <span
                  className={cn(
                    'inline-block px-2 py-0.5 text-xs font-medium',
                    tone[request.status],
                  )}
                >
                  {t.status[request.status]}
                </span>
              </div>
              <p className="text-xs text-muted">
                {interpolate(t.requestedOn, { date: formatDate(request.createdAt, locale) })} ·{' '}
                {t.reasons[request.reason]}
              </p>
              <ul className="space-y-1 text-text">
                {request.items.map((item) => (
                  <li key={item.orderItemId}>
                    {item.name}
                    {item.variantName ? ` · ${item.variantName}` : ''} ×{' '}
                    <span className="ltr-nums">{item.quantity}</span>
                  </li>
                ))}
              </ul>
              {request.refundedAmount > 0 ? (
                <p className="text-success">
                  {interpolate(t.refunded, { amount: formatMoney(request.refundedAmount, locale) })}
                </p>
              ) : null}
              {request.rejectionNote ? (
                <p className="text-danger">
                  {interpolate(t.rejectionNote, { note: request.rejectionNote })}
                </p>
              ) : null}
              {request.canWithdraw ? (
                <WithdrawReturnButton
                  locale={locale}
                  returnId={request.id}
                  t={t}
                  genericError={dict.errors.generic}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {order.returnable ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {interpolate(t.window, { date: formatDate(order.returnable.deadline, locale, 'long') })}
          </p>
          <ReturnRequestForm
            locale={locale}
            orderId={order.id}
            items={order.returnable.items.flatMap((line) => {
              const item = itemsById.get(line.orderItemId)
              return item
                ? [
                    {
                      orderItemId: line.orderItemId,
                      name: item.name,
                      variantName: item.variantName,
                      imageUrl: item.imageUrl,
                      maxQuantity: line.maxQuantity,
                    },
                  ]
                : []
            })}
            t={t}
            fieldMessages={dict.errors.fields}
            genericError={dict.errors.generic}
          />
        </div>
      ) : null}
    </section>
  )
}
