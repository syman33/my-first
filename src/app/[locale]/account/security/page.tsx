import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ChangePasswordForm } from '@/components/account/change-password-form'
import { getDictionary } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { requireUserPage } from '@/lib/auth/current-user'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/account/security'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return { title: getDictionary(locale).account.security.title }
}

export default async function SecurityPage({ params }: PageProps<'/[locale]/account/security'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  await requireUserPage(locale, `/${locale}/account/security`)
  const dict = getDictionary(locale)
  return (
    <section aria-labelledby="security-title" className="space-y-8">
      <h2 id="security-title" className="font-display text-3xl text-ink">
        {dict.account.security.title}
      </h2>
      <ChangePasswordForm
        locale={locale}
        t={dict.account.security}
        passwordHint={dict.auth.register.passwordHint}
        showPassword={dict.auth.login.showPassword}
        hidePassword={dict.auth.login.hidePassword}
        fieldMessages={dict.errors.fields}
        genericError={dict.errors.generic}
      />
    </section>
  )
}
