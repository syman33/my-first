import type { Metadata, Route } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { AccountNav } from '@/components/account/account-nav'
import { VerificationBanner } from '@/components/account/verification-banner'
import { getDictionary, interpolate } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { requireUserPage } from '@/lib/auth/current-user'

export async function generateMetadata({
  params,
}: LayoutProps<'/[locale]/account'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return {
    title: {
      default: getDictionary(locale).account.title,
      template: getDictionary(locale).meta.titleTemplate,
    },
    robots: { index: false, follow: false },
  }
}

/**
 * Account area frame. Each page re-checks the session itself (layouts are
 * not re-rendered on client navigation, so they are not an auth boundary).
 */
export default async function AccountLayout({
  children,
  params,
}: LayoutProps<'/[locale]/account'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const pathname = (await headers()).get('x-pathname') ?? `/${locale}/account`
  const session = await requireUserPage(locale, pathname)
  const dict = getDictionary(locale)
  const t = dict.account
  const base = `/${locale}/account`

  return (
    <div className="container-luxe py-10 lg:py-14">
      <header className="border-b border-line pb-8">
        <p className="eyebrow">{t.title}</p>
        <h1 className="mt-3 font-display text-4xl text-ink lg:text-5xl">
          {interpolate(t.greeting, { name: session.user.name })}
        </h1>
      </header>
      {session.user.emailVerified ? null : (
        <div className="mt-6">
          <VerificationBanner
            locale={locale}
            t={dict.auth.verify}
            genericError={dict.errors.generic}
          />
        </div>
      )}
      <div className="mt-8 grid gap-8 lg:grid-cols-[14rem_1fr] lg:gap-16">
        <aside>
          <AccountNav
            label={t.navLabel}
            items={[
              { href: base as Route, label: t.nav.overview },
              { href: `${base}/orders` as Route, label: t.nav.orders, nested: true },
              { href: `${base}/addresses` as Route, label: t.nav.addresses },
              { href: `/${locale}/wishlist` as Route, label: t.nav.wishlist },
              { href: `${base}/profile` as Route, label: t.nav.profile },
              { href: `${base}/security` as Route, label: t.nav.security },
            ]}
            signOut={{ label: dict.auth.logout, locale, errorMessage: dict.errors.network }}
          />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
