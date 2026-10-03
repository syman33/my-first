import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ButtonLink } from '@/components/ui/button'
import { getDictionary, interpolate, plural } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { formatDate, formatMoney } from '@/i18n/format'
import { requireUserPage } from '@/lib/auth/current-user'
import { getAccountOverview } from '@/services/account/overview.service'
import { addressLines } from '@/utils/address'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/account'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return { title: getDictionary(locale).account.nav.overview }
}

export default async function AccountOverviewPage({ params }: PageProps<'/[locale]/account'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const session = await requireUserPage(locale, `/${locale}/account`)
  const dict = getDictionary(locale)
  const t = dict.account.overview
  const overview = await getAccountOverview(session.user.id)

  return (
    <div className="space-y-10">
      <div>
        <p className="text-text">{t.intro}</p>
        <p className="mt-2 text-sm text-muted">
          {interpolate(t.memberSince, { date: formatDate(overview.memberSince, locale) })}
        </p>
      </div>

      <section aria-labelledby="recent-orders" className="border border-line bg-paper p-6">
        <h2 id="recent-orders" className="font-display text-2xl text-ink">
          {t.recentOrders}
        </h2>
        {overview.recentOrders.length === 0 ? (
          <div className="mt-4 space-y-4">
            <p className="text-muted">{t.noOrders}</p>
            <ButtonLink href={`/${locale}/shop`} variant="secondary">
              {t.startShopping}
            </ButtonLink>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {overview.recentOrders.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm"
              >
                <div>
                  <p className="ltr-nums font-medium text-ink">{order.orderNumber}</p>
                  <p className="text-muted">
                    {formatDate(order.createdAt, locale)} ·{' '}
                    {plural(locale, order.itemCount, dict.orders.itemCount)}
                  </p>
                </div>
                <p className="text-text">{dict.orders.status[order.status]}</p>
                <p className="font-medium text-ink">{formatMoney(order.total, locale)}</p>
                <Link
                  href={`/${locale}/account/orders/${order.id}` as Route}
                  className="text-champagne-strong underline-offset-4 hover:underline"
                >
                  {dict.orders.view}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="default-address" className="border border-line bg-paper p-6">
        <h2 id="default-address" className="font-display text-2xl text-ink">
          {t.defaultAddress}
        </h2>
        {overview.defaultAddress ? (
          <address className="mt-4 space-y-1 text-sm text-text not-italic">
            <p className="font-medium text-ink">{overview.defaultAddress.fullName}</p>
            {addressLines(overview.defaultAddress, locale).map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p className="ltr-nums">{overview.defaultAddress.phone}</p>
          </address>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-muted">{t.noAddress}</p>
            <ButtonLink href={`/${locale}/account/addresses`} variant="secondary">
              {t.addAddress}
            </ButtonLink>
          </div>
        )}
      </section>
    </div>
  )
}
