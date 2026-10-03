import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProfileForm } from '@/components/account/profile-form'
import { getDictionary } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { requireUserPage } from '@/lib/auth/current-user'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/account/profile'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return { title: getDictionary(locale).account.profile.title }
}

export default async function ProfilePage({ params }: PageProps<'/[locale]/account/profile'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const { user } = await requireUserPage(locale, `/${locale}/account/profile`)
  const dict = getDictionary(locale)
  return (
    <section aria-labelledby="profile-title" className="space-y-8">
      <h2 id="profile-title" className="font-display text-3xl text-ink">
        {dict.account.profile.title}
      </h2>
      <ProfileForm
        locale={locale}
        t={dict.account.profile}
        phoneHint={dict.auth.register.phoneHint}
        optionalLabel={dict.common.optional}
        fieldMessages={dict.errors.fields}
        genericError={dict.errors.generic}
        profile={{
          name: user.name,
          email: user.email,
          phone: user.phone,
          locale: isLocale(user.locale) ? user.locale : locale,
          emailVerified: user.emailVerified,
        }}
      />
    </section>
  )
}
