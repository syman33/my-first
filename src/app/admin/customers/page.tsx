import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { FilterBar, FilterSelect } from '@/components/admin/filter-bar'
import { AdminPageHeader, Badge, DataTable, Td, Th } from '@/components/admin/ui'
import { getDictionary } from '@/i18n'
import { formatDate, formatMoney, formatNumber } from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { ADMIN_PAGE_SIZE, enumParam, pageParam, searchParam } from '@/lib/admin/params'
import { listCustomers } from '@/services/admin/customers.service'
import { formatSaudiMobile } from '@/utils/phone'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.customers.title }
}

export default async function AdminCustomersPage({ searchParams }: PageProps<'/admin/customers'>) {
  const access = await adminAccess('CUSTOMERS_VIEW', '/admin/customers')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict } = access
  const t = dict.admin.customers
  const params = await searchParams
  const filters = {
    q: searchParam(params),
    status: enumParam(params, 'status', ['ACTIVE', 'SUSPENDED'] as const),
  }
  const page = pageParam(params)
  const { rows, total } = await listCustomers(filters, page, ADMIN_PAGE_SIZE)
  const hasFilters = Boolean(filters.q || filters.status)

  return (
    <div>
      <AdminPageHeader title={t.title} description={t.description} />
      <FilterBar
        action="/admin/customers"
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
          options={(['ACTIVE', 'SUSPENDED'] as const).map((status) => ({
            value: status,
            label: t.statuses[status],
          }))}
        />
      </FilterBar>
      <DataTable
        caption={t.title}
        isEmpty={rows.length === 0}
        empty={hasFilters ? dict.admin.table.emptyFiltered : dict.admin.table.empty}
        head={
          <tr>
            <Th>{t.columns.customer}</Th>
            <Th>{t.columns.phone}</Th>
            <Th className="text-end">{t.columns.orders}</Th>
            <Th className="text-end">{t.columns.spent}</Th>
            <Th>{t.columns.joined}</Th>
            <Th>{t.columns.status}</Th>
          </tr>
        }
      >
        {rows.map((customer) => (
          <tr key={customer.id} className="hover:bg-ivory/50">
            <Td>
              <Link
                href={`/admin/customers/${customer.id}` as Route}
                className="font-medium text-ink hover:underline"
              >
                {customer.name}
              </Link>
              <p className="text-xs text-muted">{customer.email}</p>
            </Td>
            <Td className="ltr-nums text-muted">
              {customer.phone ? formatSaudiMobile(customer.phone) : '—'}
            </Td>
            <Td className="text-end tabular-nums">{formatNumber(customer.orders, locale)}</Td>
            <Td className="ltr-nums text-end tabular-nums">
              {formatMoney(customer.spent, locale)}
            </Td>
            <Td className="whitespace-nowrap text-muted">
              {formatDate(customer.createdAt, locale)}
            </Td>
            <Td>
              <Badge tone={customer.status === 'ACTIVE' ? 'success' : 'danger'}>
                {t.statuses[customer.status]}
              </Badge>
            </Td>
          </tr>
        ))}
      </DataTable>
      <AdminPagination
        locale={locale}
        t={dict.admin.table}
        pathname="/admin/customers"
        params={params}
        page={page}
        pageSize={ADMIN_PAGE_SIZE}
        total={total}
      />
    </div>
  )
}
