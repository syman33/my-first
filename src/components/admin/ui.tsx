import Link from 'next/link'
import type { Route } from 'next'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Locale } from '@/i18n/config'
import type { BadgeTone } from '@/lib/admin/status-tones'
import { cn } from '@/utils/cn'

/** Shared presentational pieces of the back office. */

export function AdminPageHeader({
  title,
  description,
  actions,
  back,
  locale,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  back?: { href: string; label: string }
  locale?: Locale
}) {
  const BackIcon = locale === 'ar' ? ArrowRight : ArrowLeft
  return (
    <div className="mb-8 space-y-3">
      {back ? (
        <Link
          href={back.href as Route}
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
        >
          <BackIcon className="size-4" aria-hidden="true" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl text-ink">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </div>
  )
}

export function Card({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('border border-line bg-paper', className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          {title ? <h2 className="text-sm font-medium text-ink">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-line text-text',
  info: 'bg-sand text-ink',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  accent: 'bg-champagne-soft text-champagne-strong',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-block px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Horizontally scrollable data table inside a card. */
export function DataTable({
  caption,
  head,
  children,
  empty,
  isEmpty,
}: {
  caption: string
  head: ReactNode
  children: ReactNode
  empty: ReactNode
  isEmpty: boolean
}) {
  return (
    <div className="overflow-x-auto border border-line bg-paper">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line bg-ivory/60 text-start text-xs text-muted">
          {head}
        </thead>
        <tbody className="divide-y divide-line">
          {isEmpty ? (
            <tr>
              <td colSpan={99} className="px-4 py-12 text-center text-muted">
                {empty}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  )
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn('px-4 py-3 text-start font-medium whitespace-nowrap', className)}>
      {children}
    </th>
  )
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 align-middle', className)}>{children}</td>
}

/** Label/value pairs for detail pages. */
export function DefinitionList({
  items,
  className,
}: {
  items: { label: ReactNode; value: ReactNode }[]
  className?: string
}) {
  return (
    <dl
      className={cn('grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr]', className)}
    >
      {items.map((item, index) => (
        <div key={index} className="contents">
          <dt className="text-muted">{item.label}</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere] text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
