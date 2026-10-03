import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import type { Route } from 'next'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { CancelOrderButton } from '@/components/orders/cancel-order-button'
import { OrderReturns } from '@/components/orders/order-returns'
import { OrderStatusBadge } from '@/components/orders/order-status-badge'
import { PayOrderButton } from '@/components/orders/pay-order-button'
import { getDictionary, interpolate } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { formatBasisPoints, formatDateTime, formatMoney } from '@/i18n/format'
import { requireUserPage } from '@/lib/auth/current-user'
import { isAppError } from '@/lib/errors'
import { uuidField } from '@/schemas/common'
import { getCustomerOrder } from '@/services/orders/order-query.service'
import { addressLines } from '@/utils/address'
import { formatSaudiMobile } from '@/utils/phone'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/account/orders/[id]'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return { title: getDictionary(locale).orders.list.title }
}

async function loadOrder(userId: string, rawId: string, locale: 'ar' | 'en') {
  const id = uuidField.safeParse(rawId)
  if (!id.success) return null
  try {
    return await getCustomerOrder(userId, id.data, locale)
  } catch (error) {
    if (isAppError(error) && error.code === 'ORDER_NOT_FOUND') return null
    throw error
  }
}

export default async function OrderDetailPage({
  params,
}: PageProps<'/[locale]/account/orders/[id]'>) {
  const { locale, id } = await params
  if (!isLocale(locale)) notFound()
  const { user } = await requireUserPage(locale, `/${locale}/account/orders/${id}`)
  const order = await loadOrder(user.id, id, locale)
  if (!order) notFound()

  const dict = getDictionary(locale)
  const t = dict.orders
  const money = (amount: number) => formatMoney(amount, locale)
  const Back = locale === 'ar' ? ArrowRight : ArrowLeft
  const reason = order.cancellationReason
    ? ((t.detail.reasons as Record<string, string>)[order.cancellationReason] ??
      order.cancellationReason)
    : null

  return (
    <article className="space-y-10" aria-labelledby="order-title">
      <div>
        <Link
          href={`/${locale}/account/orders` as Route}
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
        >
          <Back className="size-4" aria-hidden="true" />
          {t.detail.back}
        </Link>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="order-title" className="font-display text-3xl text-ink">
              {interpolate(t.detail.title, { number: order.orderNumber })}
            </h2>
            <p className="mt-1 text-sm text-muted">{formatDateTime(order.createdAt, locale)}</p>
          </div>
          <OrderStatusBadge
            status={order.status}
            label={t.status[order.status]}
            className="text-sm"
          />
        </div>
      </div>

      {order.canPay && order.paymentDeadline ? (
        <div className="flex flex-col gap-4 border border-warning/30 bg-warning-soft p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-warning">
            {interpolate(t.detail.payBy, { time: formatDateTime(order.paymentDeadline, locale) })}
          </p>
          <PayOrderButton
            locale={locale}
            orderId={order.id}
            label={t.detail.payNow}
            genericError={dict.errors.generic}
          />
        </div>
      ) : null}

      {order.status === 'CANCELLED' && reason ? (
        <p className="text-sm text-danger">
          {interpolate(t.detail.cancellationReason, { reason })}
        </p>
      ) : null}

      <section aria-labelledby="order-items">
        <h3 id="order-items" className="text-sm font-medium text-ink">
          {t.detail.items}
        </h3>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {order.items.map((item) => (
            <li key={item.id} className="flex gap-4 py-4">
              <span className="relative block aspect-[4/5] w-16 shrink-0 overflow-hidden bg-sand">
                {item.imageUrl ? (
                  <Image src={item.imageUrl} alt="" fill sizes="64px" className="object-cover" />
                ) : null}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                {item.slug ? (
                  <Link
                    href={`/${locale}/product/${encodeURIComponent(item.slug)}` as Route}
                    className="font-medium text-ink hover:underline"
                  >
                    {item.name}
                  </Link>
                ) : (
                  <p className="font-medium text-ink">{item.name}</p>
                )}
                {item.variantName ? <p className="text-xs text-muted">{item.variantName}</p> : null}
                <p className="text-xs text-muted">
                  {interpolate(t.detail.quantity, { count: item.quantity })} ·{' '}
                  <span className="ltr-nums">{money(item.unitPrice)}</span>
                </p>
              </div>
              <p className="ltr-nums text-sm font-medium text-ink">{money(item.lineTotal)}</p>
            </li>
          ))}
        </ul>
        <dl className="ms-auto mt-4 max-w-sm space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{dict.cart.bag.subtotal}</dt>
            <dd className="ltr-nums">{money(order.subtotal)}</dd>
          </div>
          {order.discountTotal > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">
                {interpolate(dict.cart.bag.discount, { code: order.couponCode ?? '' })}
              </dt>
              <dd className="ltr-nums">−{money(order.discountTotal)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{dict.checkout.shipping[order.shippingMethod]}</dt>
            <dd className="ltr-nums">
              {order.shippingTotal === 0 ? dict.cart.bag.shippingFree : money(order.shippingTotal)}
            </dd>
          </div>
          {order.codFee > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{dict.cart.bag.codFee}</dt>
              <dd className="ltr-nums">{money(order.codFee)}</dd>
            </div>
          ) : null}
          {!order.pricesIncludeTax && order.taxTotal > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">
                {interpolate(dict.cart.bag.vat, {
                  rate: formatBasisPoints(order.taxRateBps, locale),
                })}
              </dt>
              <dd className="ltr-nums">{money(order.taxTotal)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4 border-t border-line pt-3 text-base font-medium text-ink">
            <dt>{dict.cart.bag.total}</dt>
            <dd className="ltr-nums">{money(order.total)}</dd>
          </div>
          {order.pricesIncludeTax && order.taxTotal > 0 ? (
            <p className="text-xs text-muted">
              {interpolate(dict.cart.bag.vatIncluded, {
                rate: formatBasisPoints(order.taxRateBps, locale),
              })}
              : <span className="ltr-nums">{money(order.taxTotal)}</span>
            </p>
          ) : null}
        </dl>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section aria-labelledby="order-address">
          <h3 id="order-address" className="text-sm font-medium text-ink">
            {t.detail.address}
          </h3>
          <address className="mt-3 space-y-0.5 text-sm text-text not-italic">
            <p className="font-medium text-ink">{order.shippingAddress.fullName}</p>
            {addressLines(order.shippingAddress, locale).map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p className="ltr-nums">{formatSaudiMobile(order.shippingAddress.phone)}</p>
          </address>
        </section>
        <section aria-labelledby="order-payment">
          <h3 id="order-payment" className="text-sm font-medium text-ink">
            {t.detail.payment}
          </h3>
          <p className="mt-3 text-sm text-text">{dict.paymentMethodNames[order.paymentMethod]}</p>
          <p className="mt-1 text-sm text-muted">
            {t.detail.paymentStatus}: {t.paymentStatus[order.paymentStatus]}
          </p>
          {order.shipments[0]?.trackingNumber ? (
            <p className="mt-3 text-sm">
              {order.shipments[0].trackingUrl ? (
                <a
                  href={order.shipments[0].trackingUrl}
                  className="underline underline-offset-4"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.detail.tracking}
                </a>
              ) : null}{' '}
              <span className="ltr-nums text-muted">
                {interpolate(t.detail.trackingNumber, {
                  number: order.shipments[0].trackingNumber,
                })}
              </span>
            </p>
          ) : null}
        </section>
      </div>

      {order.customerNote ? (
        <section aria-labelledby="order-note">
          <h3 id="order-note" className="text-sm font-medium text-ink">
            {t.detail.note}
          </h3>
          <p className="mt-2 text-sm whitespace-pre-line text-text">{order.customerNote}</p>
        </section>
      ) : null}

      <OrderReturns locale={locale} order={order} dict={dict} />

      <section aria-labelledby="order-timeline">
        <h3 id="order-timeline" className="text-sm font-medium text-ink">
          {t.detail.timeline}
        </h3>
        <ol className="mt-4 space-y-4 border-s border-line ps-6">
          {order.history.map((entry, index) => (
            <li key={`${entry.status}-${index}`} className="relative text-sm">
              <span
                className="absolute -start-[1.6rem] top-1.5 size-2.5 rounded-full bg-ink"
                aria-hidden="true"
              />
              <p className="font-medium text-ink">{t.status[entry.status]}</p>
              <p className="text-xs text-muted">{formatDateTime(entry.at, locale)}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="flex flex-wrap items-start gap-4 border-t border-line pt-6">
        <Link
          href={`/${locale}/account/orders/${order.id}/invoice` as Route}
          className="inline-flex h-11 items-center border border-ink px-6 text-sm font-medium text-ink hover:bg-ink hover:text-paper"
        >
          {t.detail.invoice}
        </Link>
        {order.canCancel ? (
          <CancelOrderButton
            locale={locale}
            orderId={order.id}
            t={t.detail}
            genericError={dict.errors.generic}
          />
        ) : null}
      </div>
    </article>
  )
}
