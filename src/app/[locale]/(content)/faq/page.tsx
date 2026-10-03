import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Breadcrumbs } from '@/components/catalog/breadcrumbs'
import { JsonLd } from '@/components/seo/json-ld'
import { getDictionary } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { openGraph, samePathAlternates } from '@/lib/seo'
import { getPublishedFaq } from '@/services/content/page.service'

export async function generateMetadata({ params }: PageProps<'/[locale]/faq'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = getDictionary(locale).store.faq
  return {
    title: t.title,
    description: t.description,
    alternates: samePathAlternates(locale, '/faq'),
    openGraph: openGraph(locale, {
      title: t.title,
      description: t.description,
      url: `/${locale}/faq`,
    }),
  }
}

export default async function FaqPage({ params }: PageProps<'/[locale]/faq'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const dict = getDictionary(locale)
  const t = dict.store.faq
  const items = await getPublishedFaq(locale)
  return (
    <div className="container-luxe py-10 lg:py-16">
      <Breadcrumbs
        locale={locale}
        label={dict.store.product.breadcrumb}
        items={[
          { name: dict.common.home, href: `/${locale}` },
          { name: t.title, href: `/${locale}/faq` },
        ]}
      />
      <header className="mt-8 max-w-3xl">
        <h1 className="font-display text-4xl text-ink md:text-5xl">{t.title}</h1>
        <p className="mt-3 text-muted">{t.description}</p>
      </header>
      <div className="mt-10 max-w-3xl divide-y divide-line border-y border-line">
        {items.map((item) => (
          <details key={item.id} className="group py-5">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-start font-medium text-ink">
              <span>{item.question}</span>
              <Plus
                className="mt-1 size-4 shrink-0 transition-transform group-open:rotate-45"
                aria-hidden="true"
              />
            </summary>
            <p className="mt-3 leading-8 text-text">{item.answer}</p>
          </details>
        ))}
      </div>
      <p className="mt-10 text-text">
        {t.moreHelp}{' '}
        <Link
          href={`/${locale}/contact`}
          className="font-medium text-ink underline underline-offset-4"
        >
          {t.contactUs}
        </Link>
      </p>
      {items.length > 0 ? (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: items.map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: { '@type': 'Answer', text: item.answer },
            })),
          }}
        />
      ) : null}
    </div>
  )
}
