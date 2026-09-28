import '@/styles/globals.css'
import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { htmlLang, isLocale, localeDirection } from '@/i18n/config'
import { getDictionary } from '@/i18n'
import { fontVariables } from '@/styles/fonts'

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
  await headers()
  const dict = getDictionary(locale)

  return (
    <html lang={htmlLang[locale]} dir={localeDirection[locale]} className={fontVariables}>
      <body className="min-h-dvh">
        <a href="#main-content" className="skip-link">
          {dict.common.skipToContent}
        </a>
        <main id="main-content">{children}</main>
      </body>
    </html>
  )
}
