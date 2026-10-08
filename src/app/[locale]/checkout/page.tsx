import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { VerificationBanner } from '@/components/account/verification-banner'
import { TrackEvent } from '@/components/analytics/analytics-provider'
import { CheckoutForm } from '@/components/checkout/checkout-form'
import { ButtonLink } from '@/components/ui/button'
import { getDictionary } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { cartLineItem } from '@/lib/analytics/cart'
import { requireUserPage } from '@/lib/auth/current-user'
import { env } from '@/lib/env'
import { listAddresses } from '@/services/account/address.service'
import { getCartView } from '@/services/cart/cart.service'
import { paymentMethodOptions } from '@/services/payments/methods'
import { getSettings } from '@/services/settings/settings.service'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/checkout'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return { title: getDictionary(locale).checkout.title, robots: { index: false, follow: false } }
}

export default async function CheckoutPage({ params }: PageProps<'/[locale]/checkout'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const { user } = await requireUserPage(locale, `/${locale}/checkout`)
  const dict = getDictionary(locale)
  const [baseCart, addresses, shipping, payments, cod, checkoutSettings] = await Promise.all([
    getCartView({ userId: user.id }, locale, { userId: user.id }),
    listAddresses(user.id),
    getSettings('shipping'),
    getSettings('payments'),
    getSettings('cod'),
    getSettings('checkout'),
  ])
  // Preselect an online method when one is available, and price the bag for that exact choice.
  const baseOptions = paymentMethodOptions(payments, cod, baseCart.totals)
  const initialPaymentMethod =
    baseOptions.find((o) => o.available && o.method !== 'COD')?.method ??
    baseOptions.find((o) => o.available)?.method ??
    null
  const cart = initialPaymentMethod
    ? await getCartView({ userId: user.id }, locale, {
        userId: user.id,
        paymentMethod: initialPaymentMethod,
      })
    : baseCart

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <h1 className="font-display text-4xl text-ink md:text-5xl">{dict.checkout.title}</h1>
      <p className="text-sm text-muted">{dict.checkout.secure}</p>
    </div>
  )

  if (cart.lines.length === 0 || cart.hasIssues) {
    return (
      <div className="container-luxe py-10 lg:py-14">
        {header}
        <div className="mt-8 flex flex-col items-start gap-4">
          <p className="text-text">
            {cart.lines.length === 0 ? dict.checkout.emptyBag : dict.checkout.itemsChanged}
          </p>
          <ButtonLink
            href={cart.lines.length === 0 ? `/${locale}/shop` : `/${locale}/cart`}
            variant="secondary"
          >
            {cart.lines.length === 0 ? dict.cart.bag.continueShopping : dict.checkout.reviewBag}
          </ButtonLink>
        </div>
      </div>
    )
  }

  return (
    <div className="container-luxe py-10 lg:py-14">
      <TrackEvent
        event={{
          name: 'checkout_started',
          value: cart.totals.total,
          items: cart.lines.map((line) => cartLineItem(line)),
        }}
      />
      {header}
      {checkoutSettings.requireEmailVerification && !user.emailVerified ? (
        <div className="mt-6" data-testid="checkout-verify-email">
          <VerificationBanner
            locale={locale}
            t={{
              banner: dict.checkout.verifyFirst,
              resend: dict.auth.verify.resend,
              resent: dict.auth.verify.resent,
            }}
            genericError={dict.errors.generic}
          />
        </div>
      ) : null}
      <div className="mt-8">
        <CheckoutForm
          locale={locale}
          dict={{
            checkout: dict.checkout,
            paymentMethodNames: dict.paymentMethodNames,
            errors: dict.errors,
            bag: dict.cart.bag,
            addresses: dict.account.addresses,
            optional: dict.common.optional,
          }}
          email={user.email}
          addresses={addresses.map(
            ({ country: _country, createdAt: _createdAt, ...address }) => address,
          )}
          initialCart={cart}
          initialPaymentOptions={paymentMethodOptions(payments, cod, cart.totals)}
          initialPaymentMethod={initialPaymentMethod}
          shippingOptions={[
            {
              method: 'STANDARD',
              daysMin: shipping.standardDaysMin,
              daysMax: shipping.standardDaysMax,
            },
            ...(shipping.expressEnabled
              ? [
                  {
                    method: 'EXPRESS' as const,
                    daysMin: shipping.expressDaysMin,
                    daysMax: shipping.expressDaysMax,
                  },
                ]
              : []),
          ]}
          cod={{ min: cod.minOrder, max: cod.maxOrder, fee: cod.fee }}
          testMode={env().PAYMENT_PROVIDER === 'mock'}
        />
      </div>
    </div>
  )
}
