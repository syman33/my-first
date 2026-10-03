import Link from 'next/link'
import type { Route } from 'next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { JsonLd } from '@/components/seo/json-ld'
import type { Locale } from '@/i18n/config'
import { absoluteUrl } from '@/lib/seo'

export interface Crumb {
  name: string
  href: string
}

/** Visible breadcrumb trail plus BreadcrumbList structured data. The last crumb is the current page. */
export function Breadcrumbs({
  locale,
  label,
  items,
}: {
  locale: Locale
  label: string
  items: Crumb[]
}) {
  const Separator = locale === 'ar' ? ChevronLeft : ChevronRight
  return (
    <>
      <nav aria-label={label} className="text-xs text-muted">
        <ol className="flex flex-wrap items-center gap-1.5">
          {items.map((item, index) => {
            const last = index === items.length - 1
            return (
              <li key={item.href} className="flex items-center gap-1.5">
                {last ? (
                  <span aria-current="page" className="text-text">
                    {item.name}
                  </span>
                ) : (
                  <>
                    <Link href={item.href as Route} className="hover:text-ink">
                      {item.name}
                    </Link>
                    <Separator className="size-3" aria-hidden="true" />
                  </>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: items.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: item.name,
            item: absoluteUrl(item.href),
          })),
        }}
      />
    </>
  )
}
