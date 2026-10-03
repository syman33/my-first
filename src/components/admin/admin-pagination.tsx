import Link from 'next/link'
import type { Route } from 'next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { type Dictionary, interpolate } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { formatNumber } from '@/i18n/format'
import { listHref, type SearchParamsRecord } from '@/lib/admin/params'
import { cn } from '@/utils/cn'

/** "Showing 26–50 of 312" with previous/next links that keep the current filters. */
export function AdminPagination({
  locale,
  t,
  pathname,
  params,
  page,
  pageSize,
  total,
}: {
  locale: Locale
  t: Dictionary['admin']['table']
  pathname: string
  params: SearchParamsRecord
  page: number
  pageSize: number
  total: number
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const Previous = locale === 'ar' ? ChevronRight : ChevronLeft
  const Next = locale === 'ar' ? ChevronLeft : ChevronRight
  const link = 'inline-flex size-9 items-center justify-center border border-line bg-paper'
  return (
    <nav
      aria-label={t.pagination}
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted"
    >
      <p className="ltr-nums">
        {interpolate(t.showing, {
          from: formatNumber(from, locale),
          to: formatNumber(to, locale),
          total: formatNumber(total, locale),
        })}
      </p>
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              href={listHref(pathname, params, { page: page - 1 }) as Route}
              className={cn(link, 'text-ink hover:border-ink')}
              rel="prev"
            >
              <Previous className="size-4" aria-hidden="true" />
              <span className="sr-only">{t.previous}</span>
            </Link>
          ) : (
            <span className={cn(link, 'text-line-strong')} aria-hidden="true">
              <Previous className="size-4" />
            </span>
          )}
          <span className="px-2">
            {interpolate(t.page, {
              page: formatNumber(page, locale),
              pages: formatNumber(pages, locale),
            })}
          </span>
          {page < pages ? (
            <Link
              href={listHref(pathname, params, { page: page + 1 }) as Route}
              className={cn(link, 'text-ink hover:border-ink')}
              rel="next"
            >
              <Next className="size-4" aria-hidden="true" />
              <span className="sr-only">{t.next}</span>
            </Link>
          ) : (
            <span className={cn(link, 'text-line-strong')} aria-hidden="true">
              <Next className="size-4" />
            </span>
          )}
        </div>
      ) : null}
    </nav>
  )
}
