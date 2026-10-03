import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import type { Route } from 'next'
import { notFound } from 'next/navigation'
import { Pagination } from '@/components/catalog/pagination'
import { OrderStatusBadge } from '@/components/orders/order-status-badge'
import { ButtonLink } from '@/components/ui/button'
import { getDictionary, plural } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { formatDate, formatMoney } from '@/i18n/format'
import { requireUserPage } from '@/lib/auth/current-user'
import { listCustomerOrders } from '@/services/orders/order-query.service'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/account/orders'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return { title: getDictionary(locale).orders.list.title }
}

export default async function OrdersPage({
  params,
  searchParams,
}: PageProps<'/[locale]/account/orders'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const { user } = await requireUserPage(locale, `/${locale}/account/orders`)
  const dict = getDictionary(locale)
  const t = dict.orders
  const rawPage = (await searchParams).page
  const page = Math.max(
    1,
    Math.min(500, Number.parseInt(typeof rawPage === 'string' ? rawPage : '1', 10) || 1),
  )
  const orders = await listCustomerOrders(user.id, page)

  return (
    <section aria-labelledby="orders-title" className="space-y-8">
      <h2 id="orders-title" className="font-display text-3xl text-ink">
        {t.list.title}
      </h2>
      {orders.total === 0 ? (
        <div className="space-y-4">
          <p className="text-muted">{t.list.empty}</p>
          <ButtonLink href={`/${locale}/shop`} variant="secondary">
            {t.list.startShopping}
          </ButtonLink>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-line border-y border-line" data-testid="orders-list">
            {orders.items.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/${locale}/account/orders/${order.id}` as Route}
                  className="flex flex-wrap items-center gap-4 py-5 transition-colors hover:bg-paper sm:flex-nowrap"
                >
                  <div className="flex shrink-0 -space-x-3 rtl:space-x-reverse">
                    {order.images.map((url) => (
                      <span
                        key={url}
                        className="relative block aspect-[4/5] w-12 overflow-hidden border-2 border-ivory bg-sand"
                      >
                        <Image src={url} alt="" fill sizes="48px" className="object-cover" />
                      </span>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="ltr-nums text-sm font-medium text-ink">{order.orderNumber}</p>
                    <p className="text-xs text-muted">
                      {formatDate(order.createdAt, locale)} ·{' '}
                      {plural(locale, order.itemCount, t.itemCount)}
                    </p>
                  </div>
                  <OrderStatusBadge status={order.status} label={t.status[order.status]} />
                  <p className="ltr-nums w-28 text-end text-sm font-medium text-ink">
                    {formatMoney(order.total, locale)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination
            locale={locale}
            t={dict.store.listing}
            label={dict.common.paginationLabel}
            page={page}
            pageCount={orders.pageCount}
            hrefForPage={(p) => `/${locale}/account/orders${p > 1 ? `?page=${p}` : ''}`}
          />
        </>
      )}
    </section>
  )
}
