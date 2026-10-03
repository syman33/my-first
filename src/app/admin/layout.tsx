import '@/styles/globals.css'
import type { Metadata } from 'next'
import { AdminShell } from '@/components/admin/admin-shell'
import { getDictionary } from '@/i18n'
import { htmlLang, localeDirection } from '@/i18n/config'
import { getAdminLocale } from '@/lib/admin/access'
import { getCurrentSession } from '@/lib/auth/current-user'
import { isBackOfficeRole } from '@/lib/auth/permissions'
import { env } from '@/lib/env'
import { fontVariables } from '@/styles/fonts'

export const metadata: Metadata = {
  title: { default: 'VÉLORA Admin', template: '%s | VÉLORA Admin' },
  robots: { index: false, follow: false },
}

/**
 * Back-office root. Staff get the admin frame; anyone else sees only what the
 * page itself renders (a redirect to login or the 403 view). Pages enforce
 * their own permissions.
 */
export default async function AdminRootLayout({ children }: LayoutProps<'/admin'>) {
  const [locale, session] = await Promise.all([getAdminLocale(), getCurrentSession()])
  const dict = getDictionary(locale)
  const config = env()
  const testMode = config.PAYMENT_PROVIDER === 'mock' || config.SHIPPING_PROVIDER === 'mock'
  return (
    <html lang={htmlLang[locale]} dir={localeDirection[locale]} className={fontVariables}>
      <body className="min-h-dvh bg-ivory text-text">
        {session && isBackOfficeRole(session.user.role) ? (
          <AdminShell user={session.user} locale={locale} dict={dict} testMode={testMode}>
            {children}
          </AdminShell>
        ) : (
          children
        )}
      </body>
    </html>
  )
}
