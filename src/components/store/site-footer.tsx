import Link from 'next/link'
import type { Route } from 'next'
import type { ReactNode } from 'react'
import { Logo } from '@/components/brand/logo'
import type { Locale } from '@/i18n/config'
import type { Dictionary } from '@/i18n'
import { interpolate } from '@/i18n'
import type { HeaderCategory } from './site-header'

export type FooterPaymentMethod = keyof Dictionary['paymentMethodNames']
export type FooterSocialNetwork = keyof Dictionary['footer']['social']

export interface FooterStoreInfo {
  email: string
  phone: string
  address: string
  commercialRegistration?: string
  vatNumber?: string
  social: Partial<Record<FooterSocialNetwork, string>>
}

interface SiteFooterProps {
  locale: Locale
  dict: Pick<Dictionary, 'footer' | 'paymentMethodNames'>
  categories: HeaderCategory[]
  store: FooterStoreInfo
  paymentMethods: FooterPaymentMethod[]
  year: number
}

const linkClass = 'text-paper/75 transition-colors hover:text-paper focus-visible:text-paper'

function FooterColumn({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <nav aria-labelledby={id}>
      <h2 id={id} className="eyebrow text-champagne">
        {title}
      </h2>
      <ul className="mt-5 space-y-3 text-sm">{children}</ul>
    </nav>
  )
}

/** Store footer. Only links to pages that exist and contact details that are configured are rendered. */
export function SiteFooter({
  locale,
  dict,
  categories,
  store,
  paymentMethods,
  year,
}: SiteFooterProps) {
  const t = dict.footer
  const socialEntries = (Object.keys(t.social) as FooterSocialNetwork[]).flatMap((network) => {
    const url = store.social[network]
    return url ? [{ network, url }] : []
  })
  const page = (slug: string) => `/${locale}/${slug}` as Route

  return (
    <footer className="bg-ink text-paper [--logo-accent:var(--color-champagne)]">
      <div className="container-luxe grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:py-20">
        <div>
          <Link href={`/${locale}`} className="inline-block" aria-label={`VÉLORA — ${t.company}`}>
            <Logo withArabic className="h-12 w-auto" />
          </Link>
          <p className="mt-6 max-w-sm text-sm leading-7 text-paper/75">{t.tagline}</p>
          <address className="mt-6 space-y-1.5 text-sm text-paper/75 not-italic">
            <p className="font-medium text-paper">{t.contactUs}</p>
            <p>
              <a href={`mailto:${store.email}`} className={linkClass}>
                {store.email}
              </a>
            </p>
            <p>
              <a
                href={`tel:${store.phone.replace(/[^\d+]/g, '')}`}
                className={`${linkClass} ltr-nums`}
              >
                {store.phone}
              </a>
            </p>
            <p>{store.address}</p>
          </address>
          {socialEntries.length > 0 ? (
            <div className="mt-6">
              <p className="text-sm font-medium text-paper">{t.followUs}</p>
              <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {socialEntries.map(({ network, url }) => (
                  <li key={network}>
                    <a href={url} className={linkClass} target="_blank" rel="noopener noreferrer">
                      {t.social[network]}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <FooterColumn id="footer-shop" title={t.shop}>
          {categories.map((category) => (
            <li key={category.slug}>
              <Link href={page(category.slug)} className={linkClass}>
                {category.name}
              </Link>
            </li>
          ))}
        </FooterColumn>

        <FooterColumn id="footer-help" title={t.help}>
          <li>
            <Link href={page('contact')} className={linkClass}>
              {t.contact}
            </Link>
          </li>
          <li>
            <Link href={page('faq')} className={linkClass}>
              {t.faq}
            </Link>
          </li>
          <li>
            <Link href={page('shipping')} className={linkClass}>
              {t.shipping}
            </Link>
          </li>
          <li>
            <Link href={page('returns')} className={linkClass}>
              {t.returns}
            </Link>
          </li>
        </FooterColumn>

        <FooterColumn id="footer-company" title={t.company}>
          <li>
            <Link href={page('about')} className={linkClass}>
              {t.about}
            </Link>
          </li>
          <li>
            <Link href={page('privacy')} className={linkClass}>
              {t.privacy}
            </Link>
          </li>
          <li>
            <Link href={page('terms')} className={linkClass}>
              {t.terms}
            </Link>
          </li>
        </FooterColumn>
      </div>

      <div className="border-t border-paper/10">
        <div className="container-luxe flex flex-col gap-5 py-6 text-xs text-paper/70 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p>{interpolate(t.rights, { year })}</p>
            {store.commercialRegistration || store.vatNumber ? (
              <p className="flex flex-wrap gap-x-4">
                {store.commercialRegistration ? (
                  <span>
                    {interpolate(t.commercialRegistration, {
                      number: store.commercialRegistration,
                    })}
                  </span>
                ) : null}
                {store.vatNumber ? (
                  <span>{interpolate(t.vatNumber, { number: store.vatNumber })}</span>
                ) : null}
              </p>
            ) : null}
          </div>
          {paymentMethods.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label={t.paymentMethods}>
              {paymentMethods.map((method) => (
                <li
                  key={method}
                  className="rounded-sm border border-paper/20 px-2.5 py-1 text-[11px] text-paper/85"
                >
                  {dict.paymentMethodNames[method]}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </footer>
  )
}
