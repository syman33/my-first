import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AddressBook } from '@/components/account/address-book'
import { getDictionary } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { requireUserPage } from '@/lib/auth/current-user'
import { listAddresses, MAX_ADDRESSES_PER_USER } from '@/services/account/address.service'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/account/addresses'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return { title: getDictionary(locale).account.addresses.title }
}

export default async function AddressesPage({ params }: PageProps<'/[locale]/account/addresses'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const { user } = await requireUserPage(locale, `/${locale}/account/addresses`)
  const dict = getDictionary(locale)
  const addresses = await listAddresses(user.id)
  return (
    <section aria-labelledby="addresses-title" className="space-y-8">
      <h2 id="addresses-title" className="font-display text-3xl text-ink">
        {dict.account.addresses.title}
      </h2>
      <AddressBook
        locale={locale}
        t={dict.account.addresses}
        optionalLabel={dict.common.optional}
        fieldMessages={dict.errors.fields}
        genericError={dict.errors.generic}
        addresses={addresses.map(
          ({ country: _country, createdAt: _createdAt, ...address }) => address,
        )}
        maxAddresses={MAX_ADDRESSES_PER_USER}
      />
    </section>
  )
}
