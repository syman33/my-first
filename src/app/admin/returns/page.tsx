import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { FilterBar, FilterSelect } from '@/components/admin/filter-bar'
import { AdminPageHeader, Badge, DataTable, Td, Th } from '@/components/admin/ui'
import { ReturnStatus } from '@/generated/prisma/enums'
import { getDictionary } from '@/i18n'
import { formatDateTime, formatNumber } from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { ADMIN_PAGE_SIZE, enumParam, pageParam, searchParam } from '@/lib/admin/params'
import { RETURN_STATUS_TONE } from '@/lib/admin/status-tones'
import type { ReturnReason } from '@/lib/orders/returns'
import { listAdminReturns } from '@/services/admin/returns.service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.returns.title }
}

const STATUSES = Object.values(ReturnStatus)

export default async function AdminReturnsPage({ searchParams }: PageProps<'/admin/returns'>) {
  const access = await adminAccess('ORDERS_VIEW', '/admin/returns')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict } = access
  const t = dict.admin.returns
  const params = await searchParams
  const filters = { q: searchParam(params), status: enumParam(params, 'status', STATUSES) }
  const page = pageParam(params)
  const { rows, total } = await listAdminReturns(filters, page, ADMIN_PAGE_SIZE)
  const hasFilters = Boolean(filters.q || filters.status)
  const reasons = dict.orders.returns.reasons as Record<ReturnReason, string>

  return (
    <div>
      <AdminPageHeader title={t.title} description={t.description} />
      <FilterBar
        action="/admin/returns"
        t={dict.admin.table}
        query={filters.q}
        searchPlaceholder={t.searchPlaceholder}
        hasFilters={hasFilters}
      >
        <FilterSelect
          label={t.columns.status}
          name="status"
          value={filters.status}
          allLabel={dict.admin.table.all}
          options={STATUSES.map((status) => ({
            value: status,
            label: dict.orders.returns.status[status],
          }))}
        />
      </FilterBar>
      <DataTable
        caption={t.title}
        isEmpty={rows.length === 0}
        empty={hasFilters ? dict.admin.table.emptyFiltered : dict.admin.table.empty}
        head={
          <tr>
            <Th>{t.columns.rma}</Th>
            <Th>{t.columns.order}</Th>
            <Th>{t.columns.customer}</Th>
            <Th className="text-end">{t.columns.units}</Th>
            <Th>{t.columns.reason}</Th>
            <Th>{t.columns.status}</Th>
            <Th>{t.columns.date}</Th>
          </tr>
        }
      >
        {rows.map((row) => (
          <tr key={row.id} className="hover:bg-ivory/50">
            <Td>
              <Link
                href={`/admin/returns/${row.id}` as Route}
                className="ltr-nums font-medium text-ink hover:underline"
              >
                {row.returnNumber}
              </Link>
            </Td>
            <Td>
              <Link
                href={`/admin/orders/${row.orderId}` as Route}
                className="ltr-nums text-text hover:underline"
              >
                {row.orderNumber}
              </Link>
            </Td>
            <Td>
              <p className="text-ink">{row.customerName}</p>
              <p className="text-xs text-muted">{row.customerEmail}</p>
            </Td>
            <Td className="text-end tabular-nums">{formatNumber(row.units, locale)}</Td>
            <Td className="text-muted">{reasons[row.reason as ReturnReason] ?? row.reason}</Td>
            <Td>
              <Badge tone={RETURN_STATUS_TONE[row.status]}>
                {dict.orders.returns.status[row.status]}
              </Badge>
            </Td>
            <Td className="whitespace-nowrap text-muted">
              {formatDateTime(row.createdAt, locale)}
            </Td>
          </tr>
        ))}
      </DataTable>
      <AdminPagination
        locale={locale}
        t={dict.admin.table}
        pathname="/admin/returns"
        params={params}
        page={page}
        pageSize={ADMIN_PAGE_SIZE}
        total={total}
      />
    </div>
  )
}
