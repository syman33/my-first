import '@/styles/globals.css'
import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import { defaultLocale, htmlLang, isLocale, LOCALE_COOKIE, localeDirection } from '@/i18n/config'
import { fontVariables } from '@/styles/fonts'

export const metadata: Metadata = {
  title: { default: 'VÉLORA Admin', template: '%s | VÉLORA Admin' },
  robots: { index: false, follow: false },
}

export default async function AdminRootLayout({ children }: LayoutProps<'/admin'>) {
  await headers()
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value
  const locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale
  return (
    <html lang={htmlLang[locale]} dir={localeDirection[locale]} className={fontVariables}>
      <body className="min-h-dvh bg-ivory">{children}</body>
    </html>
  )
}
