import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AuthShell } from '@/components/auth/auth-shell'
import { VerifyEmailForm } from '@/components/auth/verify-email-form'
import { getDictionary } from '@/i18n'
import { isLocale } from '@/i18n/config'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/verify-email'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return { title: getDictionary(locale).auth.verify.title, robots: { index: false, follow: false } }
}

export default async function VerifyEmailPage({ params }: PageProps<'/[locale]/verify-email'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const dict = getDictionary(locale)
  const t = dict.auth.verify
  return (
    <AuthShell title={t.title} subtitle={t.subtitle}>
      <VerifyEmailForm locale={locale} t={t} genericError={dict.errors.generic} />
    </AuthShell>
  )
}
