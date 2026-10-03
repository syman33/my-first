import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { AlertTriangle } from 'lucide-react'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { FilterBar, FilterDate, FilterSelect } from '@/components/admin/filter-bar'
import { AdminPageHeader, Badge, DataTable, Td, Th } from '@/components/admin/ui'
import { OrderStatus, PaymentMethod, PaymentStatus } from '@/generated/prisma/enums'
import { getDictionary } from '@/i18n'
import { formatDateTime, formatMoney, formatNumber } from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import {
  ADMIN_PAGE_SIZE,
  dateParam,
  enumParam,
  firstParam,
  pageParam,
  searchParam,
} from '@/lib/admin/params'
import { ORDER_STATUS_TONE, PAYMENT_STATUS_TONE } from '@/lib/admin/status-tones'
import { listAdminOrders } from '@/services/admin/orders.service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.orders.title }
}

const ORDER_STATUSES = Object.values(OrderStatus)
const PAYMENT_STATUSES = Object.values(PaymentStatus)
const PAYMENT_METHODS = Object.values(PaymentMethod)

export default async function AdminOrdersPage({ searchParams }: PageProps<'/admin/orders'>) {
  const access = await adminAccess('ORDERS_VIEW', '/admin/orders')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict } = access
  const t = dict.admin.orders
  const params = await searchParams
  const filters = {
    q: searchParam(params),
    status: enumParam(params, 'status', ORDER_STATUSES),
    paymentStatus: enumParam(params, 'payment', PAYMENT_STATUSES),
    method: enumParam(params, 'method', PAYMENT_METHODS),
    stage: firstParam(params, 'stage') === 'to_ship' ? ('to_ship' as const) : undefined,
    attention: firstParam(params, 'attention') === '1',
    refundPending: firstParam(params, 'refund') === 'pending',
    from: dateParam(params, 'from'),
    to: dateParam(params, 'to'),
  }
  const page = pageParam(params)
  const { rows, total } = await listAdminOrders(filters, page, ADMIN_PAGE_SIZE)
  const hasFilters = Object.values(filters).some((value) => value !== undefined && value !== false)
  const chips = [
    filters.stage ? t.filters.toShip : null,
    filters.attention ? t.filters.attention : null,
    filters.refundPending ? t.filters.refundPending : null,
  ].filter((chip): chip is string => chip !== null)

  return (
    <div>
      <AdminPageHeader title={t.title} description={t.description} />
      <FilterBar
        action="/admin/orders"
        t={dict.admin.table}
        query={filters.q}
        searchPlaceholder={t.searchPlaceholder}
        hasFilters={hasFilters}
      >
        <FilterSelect
          label={t.filters.status}
          name="status"
          value={filters.status}
          allLabel={dict.admin.table.all}
          options={ORDER_STATUSES.map((status) => ({
            value: status,
            label: dict.orders.status[status],
          }))}
        />
        <FilterSelect
          label={t.filters.payment}
          name="payment"
          value={filters.paymentStatus}
          allLabel={dict.admin.table.all}
          options={PAYMENT_STATUSES.map((status) => ({
            value: status,
            label: dict.orders.paymentStatus[status],
          }))}
        />
        <FilterSelect
          label={t.filters.method}
          name="method"
          value={filters.method}
          allLabel={dict.admin.table.all}
          options={PAYMENT_METHODS.map((method) => ({
            value: method,
            label: dict.paymentMethodNames[method],
          }))}
        />
        <FilterDate label={t.filters.from} name="from" value={firstParam(params, 'from')} />
        <FilterDate label={t.filters.to} name="to" value={firstParam(params, 'to')} />
        {/* Shortcut filters from the dashboard stay applied while other filters change. */}
        {filters.stage ? <input type="hidden" name="stage" value="to_ship" /> : null}
        {filters.attention ? <input type="hidden" name="attention" value="1" /> : null}
        {filters.refundPending ? <input type="hidden" name="refund" value="pending" /> : null}
      </FilterBar>
      {chips.length > 0 ? (
        <p className="mb-4 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <Badge key={chip} tone="accent">
              {chip}
            </Badge>
          ))}
        </p>
      ) : null}

      <DataTable
        caption={t.title}
        isEmpty={rows.length === 0}
        empty={hasFilters ? dict.admin.table.emptyFiltered : dict.admin.table.empty}
        head={
          <tr>
            <Th>{t.columns.order}</Th>
            <Th>{t.columns.date}</Th>
            <Th>{t.columns.customer}</Th>
            <Th className="text-end">{t.columns.items}</Th>
            <Th className="text-end">{t.columns.total}</Th>
            <Th>{t.columns.payment}</Th>
            <Th>{t.columns.status}</Th>
          </tr>
        }
      >
        {rows.map((order) => (
          <tr key={order.id} className="hover:bg-ivory/50">
            <Td>
              <span className="flex items-center gap-2">
                <Link
                  href={`/admin/orders/${order.id}` as Route}
                  className="ltr-nums font-medium text-ink hover:underline"
                >
                  {order.orderNumber}
                </Link>
                {order.attentionReason ? (
                  <AlertTriangle
                    className="size-4 text-danger"
                    aria-label={
                      (t.attentionReasons as Record<string, string>)[order.attentionReason] ??
                      t.filters.attention
                    }
                  />
                ) : null}
              </span>
            </Td>
            <Td className="whitespace-nowrap text-muted">
              {formatDateTime(order.createdAt, locale)}
            </Td>
            <Td>
              <p className="text-ink">{order.customerName}</p>
              <p className="text-xs text-muted">{order.customerEmail}</p>
            </Td>
            <Td className="text-end tabular-nums">{formatNumber(order.itemCount, locale)}</Td>
            <Td className="ltr-nums text-end whitespace-nowrap tabular-nums">
              {formatMoney(order.total, locale)}
            </Td>
            <Td>
              <p className="text-xs text-muted">{dict.paymentMethodNames[order.paymentMethod]}</p>
              <Badge tone={PAYMENT_STATUS_TONE[order.paymentStatus]}>
                {dict.orders.paymentStatus[order.paymentStatus]}
              </Badge>
            </Td>
            <Td>
              <Badge tone={ORDER_STATUS_TONE[order.status]}>
                {dict.orders.status[order.status]}
              </Badge>
            </Td>
          </tr>
        ))}
      </DataTable>
      <AdminPagination
        locale={locale}
        t={dict.admin.table}
        pathname="/admin/orders"
        params={params}
        page={page}
        pageSize={ADMIN_PAGE_SIZE}
        total={total}
      />
    </div>
  )
}
