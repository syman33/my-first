import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { BadgeCheck } from 'lucide-react'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { FilterBar, FilterSelect } from '@/components/admin/filter-bar'
import { PostAction, ReasonAction } from '@/components/admin/post-action'
import { AdminPageHeader, Badge } from '@/components/admin/ui'
import { RatingStars } from '@/components/catalog/rating-stars'
import { getDictionary, interpolate } from '@/i18n'
import { formatDateTime } from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { ADMIN_PAGE_SIZE, enumParam, pageParam, searchParam } from '@/lib/admin/params'
import { REVIEW_STATUS_TONE } from '@/lib/admin/status-tones'
import { listReviewsForAdmin } from '@/services/reviews/review.service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.reviews.title }
}

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const

export default async function AdminReviewsPage({ searchParams }: PageProps<'/admin/reviews'>) {
  const access = await adminAccess('REVIEWS_MODERATE', '/admin/reviews')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict } = access
  const t = dict.admin.reviews
  const params = await searchParams
  const filters = { q: searchParam(params), status: enumParam(params, 'status', STATUSES) }
  const page = pageParam(params)
  const { rows, total } = await listReviewsForAdmin(filters, page, ADMIN_PAGE_SIZE)
  const hasFilters = Boolean(filters.q || filters.status)
  const ar = locale === 'ar'

  return (
    <div>
      <AdminPageHeader title={t.title} description={t.description} />
      <FilterBar
        action="/admin/reviews"
        t={dict.admin.table}
        query={filters.q}
        searchPlaceholder={t.searchPlaceholder}
        hasFilters={hasFilters}
      >
        <FilterSelect
          label={dict.admin.orders.columns.status}
          name="status"
          value={filters.status}
          allLabel={dict.admin.table.all}
          options={STATUSES.map((status) => ({ value: status, label: t.statuses[status] }))}
        />
      </FilterBar>
      {rows.length === 0 ? (
        <p className="border border-line bg-paper px-4 py-12 text-center text-sm text-muted">
          {hasFilters ? dict.admin.table.emptyFiltered : dict.admin.table.empty}
        </p>
      ) : (
        <ul className="space-y-4">
          {rows.map((review) => (
            <li key={review.id} className="space-y-3 border border-line bg-paper p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <RatingStars rating={review.rating} label={`${review.rating}/5`} />
                  <Badge tone={REVIEW_STATUS_TONE[review.status]}>
                    {t.statuses[review.status]}
                  </Badge>
                  {review.isVerifiedPurchase ? (
                    <span className="inline-flex items-center gap-1 text-xs text-success">
                      <BadgeCheck className="size-4" aria-hidden="true" />
                      {t.verified}
                    </span>
                  ) : null}
                </div>
                <span className="text-xs text-muted">
                  {formatDateTime(review.createdAt, locale)}
                </span>
              </div>
              <Link
                href={`/admin/products/${review.product.id}` as Route}
                className="text-sm text-muted hover:text-ink hover:underline"
              >
                {ar ? review.product.nameAr : review.product.nameEn}
              </Link>
              {review.title ? <p className="font-medium text-ink">{review.title}</p> : null}
              <p className="text-sm whitespace-pre-line text-text" dir="auto">
                {review.body}
              </p>
              <p className="text-xs text-muted">
                {interpolate(t.by, { name: review.user.name })} · {review.user.email}
                {review.moderatedBy
                  ? ` · ${interpolate(t.moderatedBy, { name: review.moderatedBy.name })}`
                  : ''}
              </p>
              {review.rejectionReason ? (
                <p className="text-xs text-danger">{review.rejectionReason}</p>
              ) : null}
              <div className="flex flex-wrap items-start gap-2 border-t border-line pt-3">
                {review.status !== 'APPROVED' ? (
                  <PostAction
                    locale={locale}
                    endpoint={`/api/admin/reviews/${review.id}/moderate`}
                    body={{ decision: 'APPROVED' }}
                    label={t.approve}
                    variant="primary"
                    cancelLabel={dict.admin.form.cancel}
                    genericError={dict.errors.generic}
                  />
                ) : null}
                {review.status !== 'REJECTED' ? (
                  <ReasonAction
                    locale={locale}
                    endpoint={`/api/admin/reviews/${review.id}/moderate`}
                    body={{ decision: 'REJECTED' }}
                    label={t.reject}
                    reasonLabel={t.rejectReason}
                    variant="ghost"
                    tooShort={dict.errors.fields.tooShort}
                    genericError={dict.errors.generic}
                    cancelLabel={dict.admin.form.cancel}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <AdminPagination
        locale={locale}
        t={dict.admin.table}
        pathname="/admin/reviews"
        params={params}
        page={page}
        pageSize={ADMIN_PAGE_SIZE}
        total={total}
      />
    </div>
  )
}
