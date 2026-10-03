import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { WishlistView } from '@/components/cart/wishlist-view'
import { getDictionary } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { getCurrentSession, loginPath } from '@/lib/auth/current-user'
import { currentShopper, getWishlistView } from '@/services/wishlist/wishlist.service'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/wishlist'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return {
    title: getDictionary(locale).cart.wishlist.title,
    robots: { index: false, follow: false },
  }
}

export default async function WishlistPage({ params }: PageProps<'/[locale]/wishlist'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const dict = getDictionary(locale)
  const [owner, session] = await Promise.all([currentShopper(), getCurrentSession()])
  const entries = await getWishlistView(owner, locale)
  return (
    <div className="container-luxe py-10 lg:py-14">
      <h1 className="font-display text-4xl text-ink md:text-5xl">{dict.cart.wishlist.title}</h1>
      <div className="mt-8">
        <WishlistView
          locale={locale}
          entries={entries}
          t={dict.cart.wishlist}
          cardT={dict.store.card}
          continueShopping={dict.cart.bag.continueShopping}
          removeLabel={dict.cart.bag.remove}
          genericError={dict.errors.generic}
          signedIn={Boolean(session)}
          loginHref={loginPath(locale, `/${locale}/wishlist`)}
        />
      </div>
    </div>
  )
}
