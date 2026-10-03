import Link from 'next/link'
import type { Route } from 'next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Dictionary } from '@/i18n'
import { interpolate } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { cn } from '@/utils/cn'

/** Page numbers to show: first, last, current ±1, with gaps as null. */
export function pageWindow(current: number, total: number): (number | null)[] {
  const pages = new Set(
    [1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total),
  )
  const sorted = [...pages].sort((a, b) => a - b)
  const out: (number | null)[] = []
  for (const [index, page] of sorted.entries()) {
    const previous = sorted[index - 1]
    if (previous !== undefined && page - previous > 1) out.push(null)
    out.push(page)
  }
  return out
}

interface PaginationProps {
  locale: Locale
  t: Dictionary['store']['listing']
  label: string
  page: number
  pageCount: number
  hrefForPage: (page: number) => string
}

export function Pagination({ locale, t, label, page, pageCount, hrefForPage }: PaginationProps) {
  if (pageCount <= 1) return null
  const Previous = locale === 'ar' ? ChevronRight : ChevronLeft
  const Next = locale === 'ar' ? ChevronLeft : ChevronRight
  const linkClass = 'inline-flex size-10 items-center justify-center text-sm transition-colors'
  return (
    <nav aria-label={label} className="flex flex-col items-center gap-3">
      <ul className="flex items-center gap-1">
        <li>
          {page > 1 ? (
            <Link
              href={hrefForPage(page - 1) as Route}
              className={cn(linkClass, 'hover:bg-sand')}
              aria-label={t.previousPage}
              rel="prev"
            >
              <Previous className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <span className={cn(linkClass, 'text-line-strong')} aria-hidden="true">
              <Previous className="size-4" />
            </span>
          )}
        </li>
        {pageWindow(page, pageCount).map((entry, index) =>
          entry === null ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-muted">
              …
            </li>
          ) : (
            <li key={entry}>
              <Link
                href={hrefForPage(entry) as Route}
                aria-current={entry === page ? 'page' : undefined}
                aria-label={interpolate(t.goToPage, { page: entry })}
                className={cn(
                  linkClass,
                  'ltr-nums',
                  entry === page ? 'bg-ink text-paper' : 'hover:bg-sand',
                )}
              >
                {entry}
              </Link>
            </li>
          ),
        )}
        <li>
          {page < pageCount ? (
            <Link
              href={hrefForPage(page + 1) as Route}
              className={cn(linkClass, 'hover:bg-sand')}
              aria-label={t.nextPage}
              rel="next"
            >
              <Next className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <span className={cn(linkClass, 'text-line-strong')} aria-hidden="true">
              <Next className="size-4" />
            </span>
          )}
        </li>
      </ul>
      <p className="text-xs text-muted">{interpolate(t.pageOf, { page, pages: pageCount })}</p>
    </nav>
  )
}
