import type { Metadata } from 'next'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { CouponEditor, type CouponRow } from '@/components/admin/content/coupon-editor'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { FilterBar } from '@/components/admin/filter-bar'
import { AdminPageHeader } from '@/components/admin/ui'
import { getDictionary } from '@/i18n'
import { formatBasisPoints, formatDate, formatMoney } from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { ADMIN_PAGE_SIZE, pageParam, searchParam } from '@/lib/admin/params'
import { getCoupon, listCoupons } from '@/services/admin/content.service'
import { getCatalogOptions } from '@/services/admin/products.service'
import { toStoreDateTimeLocal } from '@/utils/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.coupons.title }
}

export default async function AdminCouponsPage({ searchParams }: PageProps<'/admin/coupons'>) {
  const access = await adminAccess('COUPONS_MANAGE', '/admin/coupons')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict } = access
  const t = dict.admin.coupons
  const params = await searchParams
  const q = searchParam(params)
  const page = pageParam(params)
  const [{ rows, total }, options] = await Promise.all([
    listCoupons({ q }, page, ADMIN_PAGE_SIZE),
    getCatalogOptions(),
  ])
  // Relations for the editable rows on this page (one query each; the page is small).
  const details = await Promise.all(rows.map((row) => getCoupon(row.id)))
  const coupons: CouponRow[] = details.map((coupon) => ({
    id: coupon.id,
    code: coupon.code,
    descriptionAr: coupon.descriptionAr,
    descriptionEn: coupon.descriptionEn,
    type: coupon.type,
    value: coupon.value,
    minOrderAmount: coupon.minOrderAmount,
    maxDiscountAmount: coupon.maxDiscountAmount,
    startsAt: coupon.startsAt ? toStoreDateTimeLocal(coupon.startsAt) : '',
    expiresAt: coupon.expiresAt ? toStoreDateTimeLocal(coupon.expiresAt) : '',
    usageLimit: coupon.usageLimit,
    usageLimitPerUser: coupon.usageLimitPerUser,
    usedCount: coupon.usedCount,
    scope: coupon.scope,
    productSkus: coupon.products.map((entry) => entry.product.sku),
    categoryIds: coupon.categories.map((entry) => entry.categoryId),
    isActive: coupon.isActive,
    discountText:
      coupon.type === 'PERCENTAGE'
        ? formatBasisPoints(coupon.value, locale)
        : formatMoney(coupon.value, locale),
    windowText:
      coupon.startsAt || coupon.expiresAt
        ? `${coupon.startsAt ? formatDate(coupon.startsAt, locale) : '…'} – ${coupon.expiresAt ? formatDate(coupon.expiresAt, locale) : '…'}`
        : t.always,
  }))

  return (
    <div>
      <AdminPageHeader title={t.title} description={t.description} />
      <FilterBar
        action="/admin/coupons"
        t={dict.admin.table}
        query={q}
        searchPlaceholder={t.searchPlaceholder}
        hasFilters={Boolean(q)}
      />
      <CouponEditor
        locale={locale}
        coupons={coupons}
        categories={options.categories
          .filter((category) => category.kind === 'STANDARD')
          .map((category) => ({
            id: category.id,
            name: locale === 'ar' ? category.nameAr : category.nameEn,
          }))}
        t={t}
        formLabels={dict.admin.form}
        emptyLabel={q ? dict.admin.table.emptyFiltered : dict.admin.table.empty}
        fieldMessages={dict.errors.fields}
        genericError={dict.errors.generic}
      />
      <AdminPagination
        locale={locale}
        t={dict.admin.table}
        pathname="/admin/coupons"
        params={params}
        page={page}
        pageSize={ADMIN_PAGE_SIZE}
        total={total}
      />
    </div>
  )
}
