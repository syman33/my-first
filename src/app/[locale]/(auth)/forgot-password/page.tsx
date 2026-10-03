import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AuthShell } from '@/components/auth/auth-shell'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'
import { getDictionary } from '@/i18n'
import { isLocale } from '@/i18n/config'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/forgot-password'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return { title: getDictionary(locale).auth.forgot.title, robots: { index: false, follow: false } }
}

export default async function ForgotPasswordPage({
  params,
}: PageProps<'/[locale]/forgot-password'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const dict = getDictionary(locale)
  const t = dict.auth.forgot
  return (
    <AuthShell
      title={t.title}
      subtitle={t.subtitle}
      footer={
        <Link
          href={`/${locale}/login`}
          className="font-medium text-ink underline underline-offset-4"
        >
          {t.backToLogin}
        </Link>
      }
    >
      <ForgotPasswordForm
        locale={locale}
        t={t}
        fieldMessages={dict.errors.fields}
        genericError={dict.errors.generic}
      />
    </AuthShell>
  )
}
