import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/catalog/breadcrumbs'
import { ContactForm } from '@/components/content/contact-form'
import { getDictionary } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { getCurrentSession } from '@/lib/auth/current-user'
import { openGraph, samePathAlternates } from '@/lib/seo'
import { getSettings } from '@/services/settings/settings.service'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/contact'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = getDictionary(locale).store.contact
  return {
    title: t.title,
    description: t.description,
    alternates: samePathAlternates(locale, '/contact'),
    openGraph: openGraph(locale, {
      title: t.title,
      description: t.description,
      url: `/${locale}/contact`,
    }),
  }
}

export default async function ContactPage({ params }: PageProps<'/[locale]/contact'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const dict = getDictionary(locale)
  const t = dict.store.contact
  const [store, session] = await Promise.all([getSettings('store'), getCurrentSession()])
  return (
    <div className="container-luxe py-10 lg:py-16">
      <Breadcrumbs
        locale={locale}
        label={dict.store.product.breadcrumb}
        items={[
          { name: dict.common.home, href: `/${locale}` },
          { name: t.title, href: `/${locale}/contact` },
        ]}
      />
      <div className="mt-8 grid gap-12 lg:grid-cols-[1fr_20rem] lg:gap-20">
        <div className="max-w-2xl">
          <h1 className="font-display text-4xl text-ink md:text-5xl">{t.title}</h1>
          <p className="mt-3 text-muted">{t.description}</p>
          <div className="mt-10">
            <ContactForm
              locale={locale}
              t={t}
              optionalLabel={dict.common.optional}
              fieldMessages={dict.errors.fields}
              genericError={dict.errors.generic}
              defaults={{ name: session?.user.name ?? '', email: session?.user.email ?? '' }}
            />
          </div>
        </div>
        <aside aria-labelledby="contact-details" className="h-fit border border-line bg-paper p-6">
          <h2 id="contact-details" className="font-display text-2xl text-ink">
            {t.detailsTitle}
          </h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div>
              <dt className="text-muted">{t.emailLabel}</dt>
              <dd>
                <a
                  href={`mailto:${store.email}`}
                  className="text-ink underline-offset-4 hover:underline"
                >
                  {store.email}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-muted">{t.phoneLabel}</dt>
              <dd>
                <a
                  href={`tel:${store.phone.replace(/[^\d+]/g, '')}`}
                  className="ltr-nums text-ink underline-offset-4 hover:underline"
                >
                  {store.phone}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-muted">{t.addressLabel}</dt>
              <dd>{locale === 'ar' ? store.addressAr : store.addressEn}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  )
}
