import type { Metadata } from 'next'
import { FlaskConical } from 'lucide-react'
import { notFound } from 'next/navigation'
import { MockPaymentActions } from '@/components/checkout/mock-payment-actions'
import { getDictionary } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { formatMoney } from '@/i18n/format'
import { requireUserPage } from '@/lib/auth/current-user'
import { getMockPayment } from '@/services/payments/mock-simulator.service'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/payment/mock/[providerPaymentId]'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return {
    title: getDictionary(locale).checkout.mock.title,
    robots: { index: false, follow: false },
  }
}

/** Stand-in for a provider's hosted payment page — exists only with PAYMENT_PROVIDER=mock. */
export default async function MockPaymentPage({
  params,
}: PageProps<'/[locale]/payment/mock/[providerPaymentId]'>) {
  const { locale, providerPaymentId } = await params
  if (!isLocale(locale)) notFound()
  const { user } = await requireUserPage(locale, `/${locale}/payment/mock/${providerPaymentId}`)
  const payment = await getMockPayment(providerPaymentId, user.id)
  if (!payment) notFound()
  const dict = getDictionary(locale)
  const t = dict.checkout.mock
  return (
    <div className="container-luxe flex min-h-[60vh] items-center justify-center py-16">
      <div className="w-full max-w-md border border-warning/40 bg-paper p-8">
        <p className="inline-flex items-center gap-2 bg-warning-soft px-3 py-1 text-xs font-medium text-warning">
          <FlaskConical className="size-3.5" aria-hidden="true" />
          {t.badge}
        </p>
        <h1 className="mt-5 font-display text-3xl text-ink">{t.title}</h1>
        <p className="mt-3 text-sm text-muted">{t.notice}</p>
        <dl className="mt-6 space-y-2 border-y border-line py-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{t.order}</dt>
            <dd className="ltr-nums font-medium">{payment.order.orderNumber}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{t.amount}</dt>
            <dd className="ltr-nums font-medium">{formatMoney(payment.amount, locale)}</dd>
          </div>
        </dl>
        <div className="mt-6">
          {payment.status === 'PENDING' ? (
            <MockPaymentActions
              locale={locale}
              providerPaymentId={providerPaymentId}
              t={t}
              genericError={dict.errors.generic}
            />
          ) : (
            <p className="text-sm text-muted">{dict.orders.paymentStatus[payment.status]}</p>
          )}
        </div>
      </div>
    </div>
  )
}
