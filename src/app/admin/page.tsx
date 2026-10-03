import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { SalesChart, type SalesChartPoint } from '@/components/admin/charts/sales-chart'
import { StatTile } from '@/components/admin/stat-tile'
import { AdminPageHeader, Badge, Card, DataTable, Td, Th } from '@/components/admin/ui'
import { getDictionary, interpolate, plural } from '@/i18n'
import { localeDirection } from '@/i18n/config'
import {
  formatCompactNumber,
  formatDateTime,
  formatDayFull,
  formatDayLabel,
  formatMoney,
  formatNumber,
  formatSignedPercent,
} from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { niceTicks } from '@/lib/admin/chart'
import { changeBps } from '@/lib/admin/metrics'
import { enumParam } from '@/lib/admin/params'
import { ORDER_STATUS_TONE } from '@/lib/admin/status-tones'
import { hasPermission } from '@/lib/auth/permissions'
import {
  type AttentionCounts,
  getAttentionCounts,
  getDashboardSummary,
  getRecentOrders,
  getTopProducts,
} from '@/services/admin/dashboard.service'
import { cn } from '@/utils/cn'
import { parseStoreDateKey } from '@/utils/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.dashboard.title }
}

const RANGES = ['today', '7d', '30d'] as const

const ATTENTION_LINKS: Record<keyof AttentionCounts, string> = {
  ordersFlagged: '/admin/orders?attention=1',
  codAwaitingConfirmation: '/admin/orders?status=PENDING&method=COD',
  readyToShip: '/admin/orders?stage=to_ship',
  returnsToReview: '/admin/returns?status=REQUESTED',
  returnsToRefund: '/admin/returns?status=RECEIVED',
  refundsPending: '/admin/orders?refund=pending',
  lowStock: '/admin/inventory?stock=low',
  reviewsPending: '/admin/reviews?status=PENDING',
  messagesNew: '/admin/messages?status=NEW',
  notificationsFailed: '/admin/notifications?status=FAILED',
}

export default async function AdminDashboardPage({ searchParams }: PageProps<'/admin'>) {
  const access = await adminAccess('DASHBOARD_VIEW', '/admin')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict, session } = access
  const t = dict.admin.dashboard
  const user = session.user
  const range = enumParam(await searchParams, 'range', RANGES) ?? '7d'
  const canOrders = hasPermission(user, 'ORDERS_VIEW')

  const [summary, attention, recent] = await Promise.all([
    getDashboardSummary(range),
    getAttentionCounts(user),
    canOrders ? getRecentOrders() : Promise.resolve([]),
  ])
  const top = await getTopProducts(summary.from, summary.to)

  const money = (value: number) => formatMoney(value, locale)
  const previousLabel = t.previous[range]
  const delta = (current: number, previous: number, upIsGood: boolean) => {
    const bps = changeBps(current, previous)
    if (bps === null)
      return {
        text: interpolate(t.deltaNone, { period: previousLabel }),
        direction: 'none' as const,
        good: null,
      }
    if (bps === 0)
      return {
        text: interpolate(t.deltaFlat, { period: previousLabel }),
        direction: 'flat' as const,
        good: null,
      }
    const up = bps > 0
    return {
      text: interpolate(t.delta, {
        change: formatSignedPercent(bps, locale),
        period: previousLabel,
      }),
      direction: up ? ('up' as const) : ('down' as const),
      good: up === upIsGood,
    }
  }

  const { current, previous } = summary
  const tiles = [
    {
      label: t.tiles.sales,
      value: money(current.sales),
      delta: delta(current.sales, previous.sales, true),
    },
    {
      label: t.tiles.orders,
      value: formatNumber(current.orders, locale),
      delta: delta(current.orders, previous.orders, true),
    },
    {
      label: t.tiles.averageOrderValue,
      value: money(current.averageOrderValue),
      delta: delta(current.averageOrderValue, previous.averageOrderValue, true),
    },
    {
      label: t.tiles.refunds,
      value: money(current.refunds),
      delta: delta(current.refunds, previous.refunds, false),
    },
    {
      label: t.tiles.newCustomers,
      value: formatCompactNumber(current.newCustomers, locale),
      delta: delta(current.newCustomers, previous.newCustomers, true),
    },
  ]

  const hourly = summary.granularity === 'hour'
  const points: SalesChartPoint[] = summary.series.map((point) => {
    const ordersLabel = plural(locale, point.orders, t.chart.ordersCount)
    if (hourly) {
      const hour = Number(point.key)
      const next = String((hour + 1) % 24).padStart(2, '0')
      return {
        label: `${point.key}:00–${next}:00`,
        axisLabel: `${point.key}:00`,
        value: point.sales,
        valueLabel: money(point.sales),
        ordersLabel,
      }
    }
    const day = parseStoreDateKey(point.key)
    return {
      label: formatDayFull(day, locale),
      axisLabel: formatDayLabel(day, locale),
      value: point.sales,
      valueLabel: money(point.sales),
      ordersLabel,
    }
  })
  const maxSales = Math.max(0, ...summary.series.map((point) => point.sales))
  const ticks = niceTicks(maxSales).map((value) => ({
    value,
    label: formatMoney(value, locale, { hideZeroFraction: true }),
  }))

  const waiting = (Object.keys(ATTENTION_LINKS) as (keyof AttentionCounts)[]).flatMap((key) => {
    const count = attention[key]
    return count !== null && count > 0 ? [{ key, count }] : []
  })
  const Chevron = locale === 'ar' ? ChevronLeft : ChevronRight

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title={t.title}
        description={t.description}
        actions={
          <nav aria-label={t.range} className="flex border border-line bg-paper text-sm">
            {RANGES.map((option) => (
              <Link
                key={option}
                href={(option === '7d' ? '/admin' : `/admin?range=${option}`) as Route}
                aria-current={option === range ? 'page' : undefined}
                className={cn(
                  'px-4 py-2 transition-colors',
                  option === range ? 'bg-ink text-paper' : 'text-ink hover:bg-sand',
                )}
              >
                {t.ranges[option]}
              </Link>
            ))}
          </nav>
        }
      />

      <section
        aria-label={t.ranges[range]}
        className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-5"
      >
        {tiles.map((tile) => (
          <StatTile key={tile.label} {...tile} />
        ))}
      </section>

      <SalesChart
        dir={localeDirection[locale]}
        title={hourly ? t.chart.hourly : t.chart.daily}
        description={t.chart.description}
        points={points}
        ticks={ticks}
        emptyNote={maxSales === 0 ? t.chart.empty : null}
        labels={{
          showTable: t.chart.showTable,
          hideTable: t.chart.hideTable,
          period: t.chart.period,
          sales: t.chart.sales,
          orders: t.chart.orders,
          hint: t.chart.hint,
        }}
      />
      <p className="-mt-4 text-xs text-muted">{t.definitions}</p>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          {canOrders ? (
            <Card
              title={t.recent.title}
              actions={
                <Link
                  href="/admin/orders"
                  className="text-xs text-muted underline underline-offset-4 hover:text-ink"
                >
                  {t.recent.viewAll}
                </Link>
              }
              bodyClassName="p-0"
            >
              <DataTable
                caption={t.recent.title}
                isEmpty={recent.length === 0}
                empty={dict.admin.table.empty}
                head={
                  <tr>
                    <Th>{dict.orders.orderNumber}</Th>
                    <Th>{t.recent.customer}</Th>
                    <Th>{dict.orders.detail.paymentStatus}</Th>
                    <Th className="text-end">{dict.orders.total}</Th>
                    <Th>{t.recent.date}</Th>
                  </tr>
                }
              >
                {recent.map((order) => (
                  <tr key={order.id} className="hover:bg-ivory/50">
                    <Td>
                      <Link
                        href={`/admin/orders/${order.id}` as Route}
                        className="ltr-nums font-medium text-ink hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <div className="mt-1">
                        <Badge tone={ORDER_STATUS_TONE[order.status]}>
                          {dict.orders.status[order.status]}
                        </Badge>
                      </div>
                    </Td>
                    <Td>{order.shippingName}</Td>
                    <Td className="text-muted">{dict.orders.paymentStatus[order.paymentStatus]}</Td>
                    <Td className="ltr-nums text-end tabular-nums">{money(order.total)}</Td>
                    <Td className="whitespace-nowrap text-muted">
                      {formatDateTime(order.createdAt, locale)}
                    </Td>
                  </tr>
                ))}
              </DataTable>
            </Card>
          ) : null}

          <Card title={t.top.title} bodyClassName="p-0">
            <DataTable
              caption={t.top.title}
              isEmpty={top.length === 0}
              empty={t.top.empty}
              head={
                <tr>
                  <Th>{t.top.product}</Th>
                  <Th className="text-end">{t.top.units}</Th>
                  <Th className="text-end">{t.top.sales}</Th>
                </tr>
              }
            >
              {top.map((product, index) => (
                <tr key={product.productId ?? `deleted-${index}`}>
                  <Td>
                    {product.productId && hasPermission(user, 'PRODUCTS_VIEW') ? (
                      <Link
                        href={`/admin/products/${product.productId}` as Route}
                        className="text-ink hover:underline"
                      >
                        {locale === 'ar' ? product.nameAr : product.nameEn}
                      </Link>
                    ) : locale === 'ar' ? (
                      product.nameAr
                    ) : (
                      product.nameEn
                    )}
                  </Td>
                  <Td className="text-end tabular-nums">{formatNumber(product.units, locale)}</Td>
                  <Td className="ltr-nums text-end tabular-nums">{money(product.sales)}</Td>
                </tr>
              ))}
            </DataTable>
          </Card>
        </div>

        <Card title={t.attention.title} className="self-start">
          {waiting.length === 0 ? (
            <p className="text-sm text-muted">{t.attention.empty}</p>
          ) : (
            <ul className="-my-2 divide-y divide-line">
              {waiting.map((item) => (
                <li key={item.key}>
                  <Link
                    href={ATTENTION_LINKS[item.key] as Route}
                    className="group flex items-center justify-between gap-3 py-3 text-sm"
                  >
                    <span className="text-text group-hover:text-ink">{t.attention[item.key]}</span>
                    <span className="flex items-center gap-2">
                      <Badge
                        tone={
                          item.key === 'notificationsFailed' || item.key === 'refundsPending'
                            ? 'danger'
                            : 'warning'
                        }
                      >
                        {formatNumber(item.count, locale)}
                      </Badge>
                      <Chevron className="size-4 text-muted" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
