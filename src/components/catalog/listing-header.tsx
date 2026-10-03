import Link from 'next/link'
import type { Route } from 'next'
import type { Locale } from '@/i18n/config'
import { Breadcrumbs, type Crumb } from './breadcrumbs'

interface ListingHeaderProps {
  locale: Locale
  breadcrumbLabel: string
  crumbs: Crumb[]
  title: string
  description?: string | null
  links?: { label: string; items: { href: string; name: string }[] }
}

export function ListingHeader({
  locale,
  breadcrumbLabel,
  crumbs,
  title,
  description,
  links,
}: ListingHeaderProps) {
  return (
    <header>
      <Breadcrumbs locale={locale} label={breadcrumbLabel} items={crumbs} />
      <h1 className="mt-6 font-display text-4xl text-ink md:text-5xl">{title}</h1>
      {description ? <p className="mt-3 max-w-2xl text-muted">{description}</p> : null}
      {links && links.items.length > 0 ? (
        <nav aria-label={links.label} className="mt-6">
          <ul className="flex flex-wrap gap-2">
            {links.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href as Route}
                  className="inline-flex h-9 items-center border border-line-strong px-4 text-sm text-ink transition-colors hover:border-ink"
                >
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  )
}
