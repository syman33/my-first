import Link from 'next/link'
import { locale as rootLocale } from 'next/root-params'
import { defaultLocale, isLocale } from '@/i18n/config'
import { getDictionary } from '@/i18n'

/** Branded 404 for the storefront (rendered inside the locale root layout). */
export default async function LocaleNotFound() {
  const segment = await rootLocale()
  const locale = isLocale(segment) ? segment : defaultLocale
  const dict = getDictionary(locale)
  return (
    <section className="container-luxe flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
      <p className="eyebrow" data-latin>
        404
      </p>
      <h1 className="mt-4 font-display text-4xl text-ink md:text-5xl">
        {dict.errors.notFoundTitle}
      </h1>
      <p className="mt-4 max-w-md text-muted">{dict.errors.notFoundBody}</p>
      <Link
        href={`/${locale}`}
        className="mt-10 inline-flex items-center border border-ink bg-ink px-8 py-3 text-sm text-paper transition-colors hover:bg-transparent hover:text-ink"
      >
        {dict.errors.backHome}
      </Link>
    </section>
  )
}
