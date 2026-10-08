import '@/styles/globals.css'
import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { AnalyticsProvider } from '@/components/analytics/analytics-provider'
import { Ga4Script } from '@/components/analytics/ga4-script'
import { SiteFooter } from '@/components/store/site-footer'
import { SiteHeader } from '@/components/store/site-header'
import { htmlLang, isLocale, localeDirection, otherLocale, pickLocalized } from '@/i18n/config'
import { getDictionary, interpolate } from '@/i18n'
import { formatMoney } from '@/i18n/format'
import { getCurrentSession } from '@/lib/auth/current-user'
import { isBackOfficeRole } from '@/lib/auth/permissions'
import { env } from '@/lib/env'
import { getShopperCounts } from '@/services/cart/counts.service'
import { getFooterCategories, getNavigationCategories } from '@/services/catalog/navigation.service'
import { getSettings } from '@/services/settings/settings.service'
import { fontVariables } from '@/styles/fonts'
import { storeYear } from '@/utils/time'
import { switchLocalePath } from '@/utils/locale-path'

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = getDictionary(locale)
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
    title: { default: dict.meta.defaultTitle, template: dict.meta.titleTemplate },
    description: dict.meta.defaultDescription,
    applicationName: 'VÉLORA',
  }
}

export const viewport: Viewport = {
  themeColor: '#f7f4ef',
  width: 'device-width',
  initialScale: 1,
}

export default async function LocaleRootLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  // Reading request headers opts every storefront route into dynamic rendering,
  // which the per-request CSP nonce requires.
  const requestHeaders = await headers()
  const dict = getDictionary(locale)

  const [navCategories, footerCategories, session, counts, shipping, store, payments] =
    await Promise.all([
      getNavigationCategories(),
      getFooterCategories(),
      getCurrentSession(),
      getShopperCounts(),
      getSettings('shipping'),
      getSettings('store'),
      getSettings('payments'),
    ])

  const announcement =
    shipping.freeShippingThreshold !== null
      ? interpolate(dict.nav.freeShippingAnnouncement, {
          amount: formatMoney(shipping.freeShippingThreshold, locale, { hideZeroFraction: true }),
        })
      : null
  const currentPath = requestHeaders.get('x-pathname') ?? `/${locale}`
  const config = env()
  const simulatedPayments = config.PAYMENT_PROVIDER === 'mock'

  return (
    <html lang={htmlLang[locale]} dir={localeDirection[locale]} className={fontVariables}>
      <body className="flex min-h-dvh flex-col">
        <AnalyticsProvider provider={config.ANALYTICS_PROVIDER}>
          <a href="#main-content" className="skip-link">
            {dict.common.skipToContent}
          </a>
          {simulatedPayments ? (
            <p
              className="bg-warning-soft px-4 py-1.5 text-center text-xs text-warning print:hidden"
              data-testid="test-mode-banner"
            >
              {dict.common.testModeBanner}
            </p>
          ) : null}
          <SiteHeader
            locale={locale}
            dict={{ nav: dict.nav, common: dict.common, auth: dict.auth }}
            categories={navCategories.map((c) => ({
              slug: c.slug,
              name: pickLocalized(c, 'name', locale),
            }))}
            user={
              session
                ? { name: session.user.name, isStaff: isBackOfficeRole(session.user.role) }
                : null
            }
            counts={counts}
            announcement={announcement}
            switchLocaleHref={switchLocalePath(currentPath, otherLocale(locale))}
          />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <SiteFooter
            locale={locale}
            dict={{ footer: dict.footer, paymentMethodNames: dict.paymentMethodNames }}
            categories={footerCategories.map((c) => ({
              slug: c.slug,
              name: pickLocalized(c, 'name', locale),
            }))}
            store={{
              email: store.email,
              phone: store.phone,
              address: locale === 'ar' ? store.addressAr : store.addressEn,
              commercialRegistration: store.commercialRegistration,
              vatNumber: store.vatNumber,
              social: store.social,
            }}
            paymentMethods={payments.enabledMethods}
            year={storeYear(new Date())}
          />
        </AnalyticsProvider>
        {config.ANALYTICS_PROVIDER === 'ga4' && config.NEXT_PUBLIC_GA_MEASUREMENT_ID ? (
          <Ga4Script
            measurementId={config.NEXT_PUBLIC_GA_MEASUREMENT_ID}
            nonce={requestHeaders.get('x-nonce') ?? undefined}
          />
        ) : null}
      </body>
    </html>
  )
}
