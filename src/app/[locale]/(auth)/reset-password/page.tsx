import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AuthShell } from '@/components/auth/auth-shell'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import { getDictionary } from '@/i18n'
import { isLocale } from '@/i18n/config'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/reset-password'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return { title: getDictionary(locale).auth.reset.title, robots: { index: false, follow: false } }
}

export default async function ResetPasswordPage({ params }: PageProps<'/[locale]/reset-password'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const dict = getDictionary(locale)
  const t = dict.auth.reset
  return (
    <AuthShell title={t.title} subtitle={t.subtitle}>
      <ResetPasswordForm
        locale={locale}
        t={t}
        signInLabel={dict.auth.login.submit}
        showPassword={dict.auth.login.showPassword}
        hidePassword={dict.auth.login.hidePassword}
        fieldMessages={dict.errors.fields}
        genericError={dict.errors.generic}
      />
    </AuthShell>
  )
}
