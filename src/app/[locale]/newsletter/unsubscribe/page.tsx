import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { UnsubscribeForm } from '@/components/content/unsubscribe-form'
import { getDictionary } from '@/i18n'
import { isLocale } from '@/i18n/config'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/newsletter/unsubscribe'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return {
    title: getDictionary(locale).store.newsletter.unsubscribeTitle,
    robots: { index: false, follow: false },
  }
}

export default async function UnsubscribePage({
  params,
}: PageProps<'/[locale]/newsletter/unsubscribe'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const dict = getDictionary(locale)
  const t = dict.store.newsletter
  return (
    <div className="container-luxe flex min-h-[50vh] flex-col justify-center py-16">
      <div className="max-w-lg">
        <h1 className="font-display text-4xl text-ink">{t.unsubscribeTitle}</h1>
        <p className="mt-3 text-muted">{t.unsubscribeText}</p>
        <div className="mt-8">
          <UnsubscribeForm locale={locale} t={t} genericError={dict.errors.generic} />
        </div>
      </div>
    </div>
  )
}
