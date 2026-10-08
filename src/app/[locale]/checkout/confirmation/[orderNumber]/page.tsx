import type { Metadata } from 'next'
import { CheckCircle2 } from 'lucide-react'
import { notFound } from 'next/navigation'
import { TrackEvent } from '@/components/analytics/analytics-provider'
import { ButtonLink } from '@/components/ui/button'
import { getDictionary, interpolate } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { formatMoney } from '@/i18n/format'
import { requireUserPage } from '@/lib/auth/current-user'
import { getOrderConfirmation } from '@/services/orders/order-query.service'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/checkout/confirmation/[orderNumber]'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return {
    title: getDictionary(locale).orders.confirmation.title,
    robots: { index: false, follow: false },
  }
}

/**
 * Shown after placing an order. The state comes from the database — reaching
 * this URL proves nothing about payment (spec §39).
 */
export default async function ConfirmationPage({
  params,
}: PageProps<'/[locale]/checkout/confirmation/[orderNumber]'>) {
  const { locale, orderNumber } = await params
  if (!isLocale(locale)) notFound()
  const { user } = await requireUserPage(locale, `/${locale}/checkout/confirmation/${orderNumber}`)
  const order = await getOrderConfirmation(user.id, orderNumber)
  if (!order) notFound()
  const dict = getDictionary(locale)
  const t = dict.orders.confirmation
  const next =
    order.paymentStatus === 'PAID'
      ? t.paidNext
      : order.paymentMethod === 'COD'
        ? t.codNext
        : t.payNext
  // A purchase counts once the order is firm: paid online, or placed cash on delivery.
  const completed = order.paymentStatus === 'PAID' || order.paymentMethod === 'COD'
  const ar = locale === 'ar'
  return (
    <div className="container-luxe flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      {completed ? (
        <TrackEvent
          onceKey={`purchase:${order.orderNumber}`}
          event={{
            name: 'purchase_completed',
            orderNumber: order.orderNumber,
            value: order.total,
            tax: order.taxTotal,
            shipping: order.shippingTotal,
            coupon: order.couponCode,
            items: order.items.map((item) => ({
              id: item.productId ?? item.sku,
              name: ar ? item.productNameAr : item.productNameEn,
              variant: (ar ? item.variantNameAr : item.variantNameEn) ?? undefined,
              price: item.unitPrice,
              quantity: item.quantity,
            })),
          }}
        />
      ) : null}
      <CheckCircle2 className="size-12 text-success" strokeWidth={1.25} aria-hidden="true" />
      <h1 className="mt-6 font-display text-4xl text-ink md:text-5xl">{t.title}</h1>
      <p className="mt-4 text-lg text-text">
        {interpolate(t.received, { number: order.orderNumber })}
      </p>
      <p className="ltr-nums mt-2 text-muted">{formatMoney(order.total, locale)}</p>
      <p className="mt-6 max-w-lg text-text" data-testid="confirmation-next">
        {next}
      </p>
      {/* Emails go out for COD orders and paid orders only (see order notification handlers). */}
      {order.paymentMethod === 'COD' || order.paymentStatus === 'PAID' ? (
        <p className="mt-2 text-sm text-muted">
          {interpolate(t.emailNote, { email: order.shippingEmail })}
        </p>
      ) : null}
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <ButtonLink href={`/${locale}/account/orders/${order.id}`}>{t.viewOrder}</ButtonLink>
        <ButtonLink href={`/${locale}/shop`} variant="secondary">
          {t.continueShopping}
        </ButtonLink>
      </div>
    </div>
  )
}
