import { notFound } from 'next/navigation'
import { isLocale } from '@/i18n/config'
import { getDictionary } from '@/i18n'

export default async function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const dict = getDictionary(locale)
  return (
    <section className="container-luxe py-24">
      <h1 className="font-display text-5xl text-ink">{dict.meta.siteName}</h1>
    </section>
  )
}
