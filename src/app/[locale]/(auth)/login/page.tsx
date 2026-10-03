import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from '@/components/auth/login-form'
import { Alert } from '@/components/ui/alert'
import { getDictionary } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { getCurrentSession } from '@/lib/auth/current-user'
import { postAuthRedirect } from '@/utils/redirect'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/login'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return { title: getDictionary(locale).auth.login.title, robots: { index: false, follow: false } }
}

export default async function LoginPage({ params, searchParams }: PageProps<'/[locale]/login'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const { next } = await searchParams
  const destination = postAuthRedirect(typeof next === 'string' ? next : null, `/${locale}/account`)
  if (await getCurrentSession()) redirect(destination as Route)

  const dict = getDictionary(locale)
  const t = dict.auth.login
  const registerHref =
    `/${locale}/register${typeof next === 'string' ? `?next=${encodeURIComponent(destination)}` : ''}` as Route

  return (
    <AuthShell
      title={t.title}
      subtitle={t.subtitle}
      footer={
        <p>
          {t.noAccount}{' '}
          <Link href={registerHref} className="font-medium text-ink underline underline-offset-4">
            {t.createAccount}
          </Link>
        </p>
      }
    >
      {destination.startsWith(`/${locale}/checkout`) ? (
        <Alert tone="info" className="mb-6">
          {t.checkoutNotice}
        </Alert>
      ) : null}
      <LoginForm
        locale={locale}
        t={t}
        fieldMessages={dict.errors.fields}
        genericError={dict.errors.generic}
        next={destination}
      />
    </AuthShell>
  )
}
