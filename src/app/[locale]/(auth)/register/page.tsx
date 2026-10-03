import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth/auth-shell'
import { RegisterForm } from '@/components/auth/register-form'
import { getDictionary } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { getCurrentSession } from '@/lib/auth/current-user'
import { postAuthRedirect } from '@/utils/redirect'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/register'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return {
    title: getDictionary(locale).auth.register.title,
    robots: { index: false, follow: false },
  }
}

export default async function RegisterPage({
  params,
  searchParams,
}: PageProps<'/[locale]/register'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const { next } = await searchParams
  const destination = postAuthRedirect(typeof next === 'string' ? next : null, `/${locale}/account`)
  if (await getCurrentSession()) redirect(destination as Route)

  const dict = getDictionary(locale)
  const t = dict.auth.register
  const loginHref =
    `/${locale}/login${typeof next === 'string' ? `?next=${encodeURIComponent(destination)}` : ''}` as Route

  return (
    <AuthShell
      title={t.title}
      subtitle={t.subtitle}
      footer={
        <p>
          {t.haveAccount}{' '}
          <Link href={loginHref} className="font-medium text-ink underline underline-offset-4">
            {t.signIn}
          </Link>
        </p>
      }
    >
      <RegisterForm
        locale={locale}
        t={t}
        showPassword={dict.auth.login.showPassword}
        hidePassword={dict.auth.login.hidePassword}
        optionalLabel={dict.common.optional}
        fieldMessages={dict.errors.fields}
        genericError={dict.errors.generic}
        next={destination}
      />
    </AuthShell>
  )
}
