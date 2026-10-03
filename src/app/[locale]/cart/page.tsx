import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CartView } from '@/components/cart/cart-view'
import { getDictionary } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { getCurrentSession } from '@/lib/auth/current-user'
import { getCartView } from '@/services/cart/cart.service'
import { currentShopper } from '@/services/wishlist/wishlist.service'

export async function generateMetadata({ params }: PageProps<'/[locale]/cart'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return { title: getDictionary(locale).cart.bag.title, robots: { index: false, follow: false } }
}

export default async function CartPage({ params }: PageProps<'/[locale]/cart'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const dict = getDictionary(locale)
  const [owner, session] = await Promise.all([currentShopper(), getCurrentSession()])
  const cart = await getCartView(owner, locale, { userId: session?.user.id ?? null })
  return (
    <div className="container-luxe py-10 lg:py-14">
      <h1 className="font-display text-4xl text-ink md:text-5xl">{dict.cart.bag.title}</h1>
      <div className="mt-6">
        <CartView
          locale={locale}
          initialCart={cart}
          t={dict.cart.bag}
          couponReasons={dict.errors.coupon}
          genericError={dict.errors.generic}
        />
      </div>
    </div>
  )
}
