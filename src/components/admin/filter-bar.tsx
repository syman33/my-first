import Form from 'next/form'
import Link from 'next/link'
import type { Route } from 'next'
import { Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { buttonClasses } from '@/components/ui/button'
import { controlClasses } from '@/components/ui/field'
import type { Dictionary } from '@/i18n'
import { cn } from '@/utils/cn'

/**
 * GET filter form for admin lists (next/form: client navigation with
 * JavaScript, a plain form without). Filters live in the URL, so lists are
 * shareable and the back button works.
 */
export function FilterBar({
  action,
  t,
  query,
  searchPlaceholder,
  children,
  hasFilters,
}: {
  action: string
  t: Dictionary['admin']['table']
  query?: string
  searchPlaceholder: string
  children?: ReactNode
  hasFilters: boolean
}) {
  return (
    <Form
      action={action}
      className="mb-4 flex flex-wrap items-end gap-3 border border-line bg-paper p-4"
      role="search"
    >
      <label className="min-w-56 flex-1 space-y-1 text-xs text-muted">
        <span>{t.search}</span>
        <span className="relative block">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder={searchPlaceholder}
            maxLength={100}
            className={cn(controlClasses, 'h-10 ps-9 text-sm')}
          />
        </span>
      </label>
      {children}
      <button type="submit" className={buttonClasses('primary', 'sm')}>
        {t.apply}
      </button>
      {hasFilters ? (
        <Link href={action as Route} className={buttonClasses('ghost', 'sm')}>
          {t.clear}
        </Link>
      ) : null}
    </Form>
  )
}

export function FilterSelect({
  label,
  name,
  value,
  options,
  allLabel,
}: {
  label: string
  name: string
  value?: string
  options: { value: string; label: string }[]
  allLabel: string
}) {
  return (
    <label className="space-y-1 text-xs text-muted">
      <span>{label}</span>
      <select
        name={name}
        defaultValue={value ?? ''}
        className={cn(controlClasses, 'h-10 min-w-40 pe-8 text-sm')}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function FilterDate({
  label,
  name,
  value,
}: {
  label: string
  name: string
  value?: string
}) {
  return (
    <label className="space-y-1 text-xs text-muted">
      <span>{label}</span>
      <input
        type="date"
        name={name}
        defaultValue={value}
        className={cn(controlClasses, 'h-10 text-sm')}
        dir="ltr"
      />
    </label>
  )
}
