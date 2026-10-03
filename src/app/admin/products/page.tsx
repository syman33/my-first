import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import type { Route } from 'next'
import { Plus } from 'lucide-react'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { FilterBar, FilterSelect } from '@/components/admin/filter-bar'
import { AdminPageHeader, Badge, DataTable, Td, Th } from '@/components/admin/ui'
import { buttonClasses } from '@/components/ui/button'
import { getDictionary } from '@/i18n'
import { formatDate, formatMoney, formatNumber } from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { ADMIN_PAGE_SIZE, enumParam, firstParam, pageParam, searchParam } from '@/lib/admin/params'
import { hasPermission } from '@/lib/auth/permissions'
import { uuidField } from '@/schemas/common'
import { getCatalogOptions, listAdminProducts } from '@/services/admin/products.service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.products.title }
}

const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const
const STATUS_TONE = { DRAFT: 'warning', PUBLISHED: 'success', ARCHIVED: 'neutral' } as const

export default async function AdminProductsPage({ searchParams }: PageProps<'/admin/products'>) {
  const access = await adminAccess('PRODUCTS_VIEW', '/admin/products')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict, session } = access
  const t = dict.admin.products
  const ar = locale === 'ar'
  const params = await searchParams
  const idParam = (key: string) => {
    const parsed = uuidField.safeParse(firstParam(params, key))
    return parsed.success ? parsed.data : undefined
  }
  const filters = {
    q: searchParam(params),
    status: enumParam(params, 'status', STATUSES),
    categoryId: idParam('category'),
    brandId: idParam('brand'),
    stock: enumParam(params, 'stock', ['low', 'out'] as const),
  }
  const page = pageParam(params)
  const [{ rows, total }, options] = await Promise.all([
    listAdminProducts(filters, page, ADMIN_PAGE_SIZE),
    getCatalogOptions(),
  ])
  const hasFilters = Object.values(filters).some(Boolean)
  const money = (value: number) => formatMoney(value, locale)

  return (
    <div>
      <AdminPageHeader
        title={t.title}
        description={t.description}
        actions={
          hasPermission(session.user, 'PRODUCTS_MANAGE') ? (
            <Link href="/admin/products/new" className={buttonClasses('primary', 'sm')}>
              <Plus className="size-4" aria-hidden="true" />
              {t.new}
            </Link>
          ) : null
        }
      />
      <FilterBar
        action="/admin/products"
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
          options={STATUSES.map((status) => ({ value: status, label: t.statuses[status] }))}
        />
        <FilterSelect
          label={t.filters.category}
          name="category"
          value={filters.categoryId}
          allLabel={dict.admin.table.all}
          options={options.categories
            .filter((category) => category.kind === 'STANDARD')
            .map((category) => ({
              value: category.id,
              label: ar ? category.nameAr : category.nameEn,
            }))}
        />
        <FilterSelect
          label={t.filters.brand}
          name="brand"
          value={filters.brandId}
          allLabel={dict.admin.table.all}
          options={options.brands.map((brand) => ({
            value: brand.id,
            label: ar ? brand.nameAr : brand.nameEn,
          }))}
        />
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
            <Th>{t.columns.product}</Th>
            <Th>{t.columns.category}</Th>
            <Th className="text-end">{t.columns.price}</Th>
            <Th className="text-end">{t.columns.stock}</Th>
            <Th>{t.columns.status}</Th>
            <Th>{t.columns.updated}</Th>
          </tr>
        }
      >
        {rows.map((product) => (
          <tr key={product.id} className="hover:bg-ivory/50">
            <Td>
              <div className="flex items-center gap-3">
                <span className="relative block aspect-[4/5] w-10 shrink-0 overflow-hidden bg-sand">
                  {product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt=""
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  ) : null}
                </span>
                <div className="min-w-0">
                  <Link
                    href={`/admin/products/${product.id}` as Route}
                    className="font-medium text-ink hover:underline"
                  >
                    {ar ? product.nameAr : product.nameEn}
                  </Link>
                  <p className="ltr-nums text-xs text-muted">{product.sku}</p>
                </div>
              </div>
            </Td>
            <Td className="text-muted">{ar ? product.categoryNameAr : product.categoryNameEn}</Td>
            <Td className="ltr-nums text-end whitespace-nowrap tabular-nums">
              {product.minPrice === product.maxPrice
                ? money(product.minPrice)
                : `${money(product.minPrice)} – ${money(product.maxPrice)}`}
            </Td>
            <Td className="text-end">
              <span className="tabular-nums">{formatNumber(product.available, locale)}</span>
              {product.lowStock ? (
                <Badge tone="warning" className="ms-2">
                  {t.lowStock}
                </Badge>
              ) : null}
            </Td>
            <Td>
              <Badge tone={STATUS_TONE[product.status]}>{t.statuses[product.status]}</Badge>
            </Td>
            <Td className="whitespace-nowrap text-muted">
              {formatDate(product.updatedAt, locale)}
            </Td>
          </tr>
        ))}
      </DataTable>
      <AdminPagination
        locale={locale}
        t={dict.admin.table}
        pathname="/admin/products"
        params={params}
        page={page}
        pageSize={ADMIN_PAGE_SIZE}
        total={total}
      />
    </div>
  )
}
