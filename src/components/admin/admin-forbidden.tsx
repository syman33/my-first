import Link from 'next/link'
import type { Route } from 'next'
import { ShieldAlert } from 'lucide-react'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { buttonClasses } from '@/components/ui/button'

/** 403 view for back-office pages the current user may not open. */
export function AdminForbidden({
  locale,
  dict,
  isCustomer,
}: {
  locale: Locale
  dict: Dictionary
  isCustomer: boolean
}) {
  const t = dict.admin.forbidden
  return (
    <section
      className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center"
      aria-labelledby="forbidden-title"
    >
      <ShieldAlert
        className="size-10 text-champagne-strong"
        strokeWidth={1.25}
        aria-hidden="true"
      />
      <h1 id="forbidden-title" className="mt-6 font-display text-3xl text-ink">
        {t.title}
      </h1>
      <p className="mt-3 text-text">{isCustomer ? t.customerBody : t.body}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {isCustomer ? null : (
          <Link href="/admin" className={buttonClasses('primary')}>
            {t.home}
          </Link>
        )}
        <Link href={`/${locale}` as Route} className={buttonClasses('secondary')}>
          {t.store}
        </Link>
      </div>
    </section>
  )
}
