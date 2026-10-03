'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { AddressForm } from '@/components/account/address-form'
import type { AddressCardData } from '@/components/account/address-book'
import { OrderSummary } from '@/components/cart/order-summary'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/field'
import type { Dictionary } from '@/i18n'
import { interpolate } from '@/i18n'
import { interpolateNodes } from '@/i18n/rich'
import type { Locale } from '@/i18n/config'
import { formatMoney } from '@/i18n/format'
import { apiRequest, ApiClientError } from '@/lib/client/api'
import type { PaymentMethodCode, ShippingMethodCode } from '@/lib/pricing/order-totals'
import type { CartView } from '@/types/cart'
import { addressLines } from '@/utils/address'
import { cn } from '@/utils/cn'
import { formatSaudiMobile } from '@/utils/phone'

export interface PaymentOptionView {
  method: PaymentMethodCode
  available: boolean
  reason: 'COD_RANGE' | 'COD_DISABLED' | null
}

interface CheckoutFormProps {
  locale: Locale
  dict: Pick<Dictionary, 'checkout' | 'paymentMethodNames' | 'errors'> & {
    bag: Dictionary['cart']['bag']
    addresses: Dictionary['account']['addresses']
    optional: string
  }
  email: string
  addresses: AddressCardData[]
  initialCart: CartView
  initialPaymentOptions: PaymentOptionView[]
  /** The method the initial totals were computed for. */
  initialPaymentMethod: PaymentMethodCode | null
  shippingOptions: { method: ShippingMethodCode; daysMin: number; daysMax: number }[]
  cod: { min: number; max: number; fee: number }
  testMode: boolean
}

interface PlacedOrder {
  orderId: string
  orderNumber: string
  next: 'pay' | 'confirmation'
}

function newKey(): string {
  return crypto.randomUUID()
}

export function CheckoutForm({
  locale,
  dict,
  email,
  addresses: initialAddresses,
  initialCart,
  initialPaymentOptions,
  initialPaymentMethod,
  shippingOptions,
  cod,
  testMode,
}: CheckoutFormProps) {
  const router = useRouter()
  const t = dict.checkout
  const [addresses, setAddresses] = useState(initialAddresses)
  const [addressId, setAddressId] = useState<string | null>(
    initialAddresses.find((a) => a.isDefault)?.id ?? initialAddresses[0]?.id ?? null,
  )
  const [addingAddress, setAddingAddress] = useState(initialAddresses.length === 0)
  const [shippingMethod, setShippingMethod] = useState<ShippingMethodCode>('STANDARD')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodCode | null>(initialPaymentMethod)
  const [note, setNote] = useState('')
  const [cart, setCart] = useState(initialCart)
  const [paymentOptions, setPaymentOptions] = useState(initialPaymentOptions)
  const [refreshing, setRefreshing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<{ text: string; bagLink?: boolean } | null>(null)
  const attempt = useRef<{ body: string; key: string } | null>(null)
  const money = (amount: number) => formatMoney(amount, locale)

  // Re-price on the server whenever delivery or payment changes (the browser never computes totals).
  const previewAbort = useRef<AbortController | null>(null)
  async function reprice(nextShipping: ShippingMethodCode, nextPayment: PaymentMethodCode | null) {
    previewAbort.current?.abort()
    const controller = new AbortController()
    previewAbort.current = controller
    const params = new URLSearchParams({ shippingMethod: nextShipping })
    if (nextPayment) params.set('paymentMethod', nextPayment)
    setRefreshing(true)
    try {
      const result = await apiRequest<{ cart: CartView; paymentOptions: PaymentOptionView[] }>(
        `/api/checkout/preview?${params.toString()}`,
        { locale, signal: controller.signal },
      )
      setCart(result.cart)
      setPaymentOptions(result.paymentOptions)
      setRefreshing(false)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setRefreshing(false)
      setError({ text: caught instanceof ApiClientError ? caught.message : dict.errors.generic })
    }
  }

  function chooseShipping(method: ShippingMethodCode) {
    setShippingMethod(method)
    void reprice(method, paymentMethod)
  }

  function choosePayment(method: PaymentMethodCode) {
    setPaymentMethod(method)
    void reprice(shippingMethod, method)
  }

  async function onAddressSaved() {
    const result = await apiRequest<{ addresses: AddressCardData[] }>('/api/account/addresses', {
      locale,
    })
    setAddresses(result.addresses)
    const newest = result.addresses.find((a) => !addresses.some((existing) => existing.id === a.id))
    setAddressId(newest?.id ?? result.addresses[0]?.id ?? null)
    setAddingAddress(false)
  }

  async function placeOrder() {
    setError(null)
    if (!addressId) {
      setError({ text: t.chooseAddress })
      return
    }
    if (!paymentMethod) return
    const body = {
      address: { type: 'saved' as const, addressId },
      shippingMethod,
      paymentMethod,
      customerNote: note.trim() || null,
      expectedTotal: cart.totals.total,
    }
    const serialized = JSON.stringify(body)
    // Same request → same idempotency key (safe retry); anything changed → new key.
    if (attempt.current?.body !== serialized) attempt.current = { body: serialized, key: newKey() }
    setSubmitting(true)
    try {
      const result = await apiRequest<{ order: PlacedOrder }>('/api/checkout', {
        body,
        locale,
        headers: { 'Idempotency-Key': attempt.current.key },
      })
      if (result.order.next === 'pay') {
        // Straight on to the provider's secure page; if that fails the order page offers "Pay now".
        try {
          const { redirectUrl } = await apiRequest<{ redirectUrl: string }>(
            `/api/orders/${result.order.orderId}/pay`,
            {
              body: {},
              locale,
            },
          )
          window.location.assign(redirectUrl)
          return
        } catch {
          router.replace(`/${locale}/account/orders/${result.order.orderId}` as Route)
          router.refresh()
          return
        }
      }
      router.replace(`/${locale}/checkout/confirmation/${result.order.orderNumber}` as Route)
      router.refresh()
    } catch (caught) {
      setSubmitting(false)
      if (!(caught instanceof ApiClientError)) {
        setError({ text: dict.errors.generic })
        return
      }
      if (caught.code === 'CART_CHANGED' && typeof caught.details.total === 'number') {
        setError({ text: interpolate(t.totalChanged, { total: money(caught.details.total) }) })
        const params = new URLSearchParams({ shippingMethod, paymentMethod })
        const preview = await apiRequest<{ cart: CartView; paymentOptions: PaymentOptionView[] }>(
          `/api/checkout/preview?${params.toString()}`,
          { locale },
        )
        setCart(preview.cart)
        setPaymentOptions(preview.paymentOptions)
        return
      }
      const bagProblem = [
        'CART_CHANGED',
        'INSUFFICIENT_STOCK',
        'INVALID_COUPON',
        'CART_EMPTY',
      ].includes(caught.code)
      setError({
        text: caught.code === 'CART_CHANGED' ? t.itemsChanged : caught.message,
        bagLink: bagProblem,
      })
    }
  }

  const section = 'border border-line bg-paper p-6'
  const selectedOption = paymentOptions.find((o) => o.method === paymentMethod)
  const canPlace =
    Boolean(addressId) && Boolean(selectedOption?.available) && !refreshing && !submitting

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_24rem] lg:gap-14">
      <div className="space-y-6">
        <section aria-labelledby="checkout-contact" className={section}>
          <h2 id="checkout-contact" className="font-display text-2xl text-ink">
            {t.contact}
          </h2>
          <p className="mt-3 text-sm text-text">{interpolate(t.contactNote, { email })}</p>
        </section>

        <section aria-labelledby="checkout-address" className={section}>
          <h2 id="checkout-address" className="font-display text-2xl text-ink">
            {t.steps.address}
          </h2>
          {addresses.length > 0 ? (
            <fieldset className="mt-5">
              <legend className="sr-only">{t.savedAddresses}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {addresses.map((address) => (
                  <label
                    key={address.id}
                    className={cn(
                      'flex cursor-pointer gap-3 border p-4 text-sm transition-colors',
                      addressId === address.id
                        ? 'border-ink'
                        : 'border-line hover:border-line-strong',
                    )}
                  >
                    <input
                      type="radio"
                      name="address"
                      value={address.id}
                      checked={addressId === address.id}
                      onChange={() => setAddressId(address.id)}
                      className="mt-1 accent-ink"
                    />
                    <span className="space-y-0.5">
                      <span className="block font-medium text-ink">
                        {address.label || address.fullName}
                      </span>
                      {addressLines(address, locale).map((line) => (
                        <span key={line} className="block text-text">
                          {line}
                        </span>
                      ))}
                      <span className="ltr-nums block text-muted">
                        {formatSaudiMobile(address.phone)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          {addingAddress ? (
            <div className="mt-6 border-t border-line pt-6">
              <h3 className="mb-4 text-sm font-medium text-ink">{t.newAddress}</h3>
              <AddressForm
                locale={locale}
                t={dict.addresses}
                optionalLabel={dict.optional}
                fieldMessages={dict.errors.fields}
                genericError={dict.errors.generic}
                onSaved={() => void onAddressSaved()}
                onCancel={addresses.length > 0 ? () => setAddingAddress(false) : undefined}
              />
            </div>
          ) : (
            <button
              type="button"
              className="mt-5 text-sm underline underline-offset-4"
              onClick={() => setAddingAddress(true)}
            >
              {t.newAddress}
            </button>
          )}
        </section>

        <section aria-labelledby="checkout-delivery" className={section}>
          <h2 id="checkout-delivery" className="font-display text-2xl text-ink">
            {t.steps.delivery}
          </h2>
          <fieldset className="mt-5 space-y-3">
            <legend className="sr-only">{t.steps.delivery}</legend>
            {shippingOptions.map((option) => (
              <label
                key={option.method}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-4 border p-4 text-sm',
                  shippingMethod === option.method
                    ? 'border-ink'
                    : 'border-line hover:border-line-strong',
                )}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="shipping"
                    value={option.method}
                    checked={shippingMethod === option.method}
                    onChange={() => chooseShipping(option.method)}
                    className="accent-ink"
                  />
                  <span>
                    <span className="block font-medium text-ink">{t.shipping[option.method]}</span>
                    <span className="block text-xs text-muted">
                      {interpolate(t.shipping.eta, {
                        days:
                          option.daysMin === option.daysMax
                            ? option.daysMin
                            : `${option.daysMin}–${option.daysMax}`,
                      })}
                    </span>
                  </span>
                </span>
                {shippingMethod === option.method ? (
                  <span className="ltr-nums text-ink">
                    {cart.totals.shippingTotal === 0
                      ? t.shipping.free
                      : money(cart.totals.shippingTotal)}
                  </span>
                ) : null}
              </label>
            ))}
          </fieldset>
        </section>

        <section aria-labelledby="checkout-payment" className={section}>
          <h2 id="checkout-payment" className="font-display text-2xl text-ink">
            {t.steps.payment}
          </h2>
          {testMode ? (
            <p className="mt-3 bg-warning-soft px-3 py-2 text-xs text-warning">
              {t.payment.testMode}
            </p>
          ) : null}
          <fieldset className="mt-5 space-y-3">
            <legend className="sr-only">{t.steps.payment}</legend>
            {paymentOptions.map((option) => (
              <label
                key={option.method}
                className={cn(
                  'flex items-center justify-between gap-4 border p-4 text-sm',
                  option.available ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
                  paymentMethod === option.method ? 'border-ink' : 'border-line',
                )}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="payment"
                    value={option.method}
                    checked={paymentMethod === option.method}
                    disabled={!option.available}
                    onChange={() => choosePayment(option.method)}
                    className="accent-ink"
                  />
                  <span>
                    <span className="block font-medium text-ink">
                      {dict.paymentMethodNames[option.method]}
                    </span>
                    {option.method === 'COD' ? (
                      <span className="block text-xs text-muted">
                        {option.available
                          ? interpolate(t.payment.codFee, { fee: money(cod.fee) })
                          : interpolate(t.payment.codUnavailable, {
                              min: money(cod.min),
                              max: money(cod.max),
                            })}
                      </span>
                    ) : null}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          {paymentMethod && paymentMethod !== 'COD' ? (
            <p className="mt-4 text-xs text-muted">{t.payment.onlineNote}</p>
          ) : null}
        </section>

        <section aria-labelledby="checkout-note" className={section}>
          <label
            id="checkout-note"
            htmlFor="checkout-note-input"
            className="font-display text-2xl text-ink"
          >
            {t.note}
          </label>
          <Textarea
            id="checkout-note-input"
            className="mt-4"
            rows={3}
            maxLength={500}
            value={note}
            placeholder={t.notePlaceholder}
            onChange={(event) => setNote(event.target.value)}
          />
        </section>
      </div>

      <div
        className="space-y-4 lg:sticky lg:top-36 lg:self-start"
        aria-busy={refreshing || undefined}
      >
        <OrderSummary
          locale={locale}
          t={dict.bag}
          totals={cart.totals}
          shippingLabel={t.shipping[shippingMethod]}
        >
          <ul className="mb-6 space-y-3">
            {cart.lines.map((line) => (
              <li key={line.id} className="flex items-center gap-3 text-xs">
                <span className="relative block aspect-[4/5] w-12 shrink-0 overflow-hidden bg-sand">
                  {line.image ? (
                    <Image src={line.image.url} alt="" fill sizes="48px" className="object-cover" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{line.name}</span>
                  <span className="block text-muted">
                    {line.variantName} × <span className="ltr-nums">{line.quantity}</span>
                  </span>
                </span>
                <span className="ltr-nums text-ink">{money(line.lineTotal)}</span>
              </li>
            ))}
          </ul>
          {error ? (
            <Alert tone="error" className="mb-4">
              {error.text}
              {error.bagLink ? (
                <>
                  {' '}
                  <Link href={`/${locale}/cart`} className="underline underline-offset-4">
                    {t.reviewBag}
                  </Link>
                </>
              ) : null}
            </Alert>
          ) : null}
          <Button
            size="lg"
            fullWidth
            onClick={() => void placeOrder()}
            disabled={!canPlace}
            loading={submitting}
            loadingLabel={t.placing}
            data-testid="place-order"
          >
            {paymentMethod && paymentMethod !== 'COD' ? t.placeOrderPay : t.placeOrder}
          </Button>
          <p className="mt-3 text-center text-xs text-muted">
            {interpolateNodes(t.agree, {
              terms: (
                <Link
                  href={`/${locale}/terms`}
                  className="underline underline-offset-4"
                  target="_blank"
                >
                  {t.terms}
                </Link>
              ),
            })}
          </p>
        </OrderSummary>
      </div>
    </div>
  )
}
