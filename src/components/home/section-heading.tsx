import Link from 'next/link'
import type { Route } from 'next'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { Locale } from '@/i18n/config'

export function SectionHeading({
  id,
  locale,
  title,
  eyebrow,
  link,
}: {
  id: string
  locale: Locale
  title: string
  eyebrow?: string
  link?: { href: string; label: string }
}) {
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight
  return (
    <div className="mb-8 flex items-end justify-between gap-6 lg:mb-10">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 id={id} className="mt-2 font-display text-3xl text-ink md:text-4xl">
          {title}
        </h2>
      </div>
      {link ? (
        <Link
          href={link.href as Route}
          className="inline-flex shrink-0 items-center gap-2 text-sm text-ink underline-offset-4 hover:underline"
        >
          {link.label}
          <Arrow className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  )
}
