import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { FilterBar, FilterSelect } from '@/components/admin/filter-bar'
import { AdminPageHeader, Badge, DataTable, Td, Th } from '@/components/admin/ui'
import { getDictionary } from '@/i18n'
import { formatNumber } from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { ADMIN_PAGE_SIZE, enumParam, pageParam, searchParam } from '@/lib/admin/params'
import { listInventory } from '@/services/admin/inventory.service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.inventory.title }
}

export default async function AdminInventoryPage({ searchParams }: PageProps<'/admin/inventory'>) {
  const access = await adminAccess('INVENTORY_VIEW', '/admin/inventory')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict } = access
  const t = dict.admin.inventory
  const ar = locale === 'ar'
  const params = await searchParams
  const filters = {
    q: searchParam(params),
    stock: enumParam(params, 'stock', ['low', 'out'] as const),
  }
  const page = pageParam(params)
  const { rows, total } = await listInventory(filters, page, ADMIN_PAGE_SIZE)
  const hasFilters = Boolean(filters.q || filters.stock)
  const n = (value: number) => formatNumber(value, locale)

  return (
    <div>
      <AdminPageHeader title={t.title} description={t.description} />
      <FilterBar
        action="/admin/inventory"
        t={dict.admin.table}
        query={filters.q}
        searchPlaceholder={t.searchPlaceholder}
        hasFilters={hasFilters}
      >
        <FilterSelect
          label={t.filters.stock}
          name="stock"
          value={filters.stock}
          allLabel={dict.admin.table.all}
          options={[
            { value: 'low', label: t.filters.low },
            { value: 'out', label: t.filters.out },
          ]}
        />
      </FilterBar>
      <DataTable
        caption={t.title}
        isEmpty={rows.length === 0}
        empty={hasFilters ? dict.admin.table.emptyFiltered : dict.admin.table.empty}
        head={
          <tr>
            <Th>{t.columns.item}</Th>
            <Th>{t.columns.sku}</Th>
            <Th className="text-end">{t.columns.onHand}</Th>
            <Th className="text-end">{t.columns.reserved}</Th>
            <Th className="text-end">{t.columns.available}</Th>
            <Th className="text-end">{t.columns.threshold}</Th>
            <Th>{t.columns.actions}</Th>
          </tr>
        }
      >
        {rows.map((row) => {
          const low = row.available <= row.threshold
          return (
            <tr key={row.variantId} className="hover:bg-ivory/50">
              <Td>
                <Link
                  href={`/admin/products/${row.productId}` as Route}
                  className="text-ink hover:underline"
                >
                  {ar ? row.productNameAr : row.productNameEn}
                </Link>
                <p className="text-xs text-muted">{ar ? row.variantNameAr : row.variantNameEn}</p>
                {!row.isActive ? <Badge tone="neutral">{t.inactive}</Badge> : null}
              </Td>
              <Td className="ltr-nums text-xs text-muted">{row.sku}</Td>
              <Td className="text-end tabular-nums">{n(row.onHand)}</Td>
              <Td className="text-end text-muted tabular-nums">{n(row.reserved)}</Td>
              <Td className="text-end">
                <Badge tone={row.available === 0 ? 'danger' : low ? 'warning' : 'success'}>
                  {n(row.available)}
                </Badge>
              </Td>
              <Td className="text-end text-muted tabular-nums">{n(row.threshold)}</Td>
              <Td>
                <Link
                  href={`/admin/inventory/${row.variantId}` as Route}
                  className="text-xs text-ink underline underline-offset-4"
                >
                  {t.history}
                </Link>
              </Td>
            </tr>
          )
        })}
      </DataTable>
      <AdminPagination
        locale={locale}
        t={dict.admin.table}
        pathname="/admin/inventory"
        params={params}
        page={page}
        pageSize={ADMIN_PAGE_SIZE}
        total={total}
      />
    </div>
  )
}
