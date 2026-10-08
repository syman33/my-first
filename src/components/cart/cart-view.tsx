'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { Route } from 'next'
import { Minus, Plus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState, useTransition } from 'react'
import { useAnalytics } from '@/components/analytics/analytics-provider'
import { Alert } from '@/components/ui/alert'
import { Button, ButtonLink, buttonClasses } from '@/components/ui/button'
import type { Dictionary } from '@/i18n'
import { interpolate, plural } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { formatMoney } from '@/i18n/format'
import { cartLineItem } from '@/lib/analytics/cart'
import { apiRequest, ApiClientError } from '@/lib/client/api'
import type { CartLineView, CartView as CartViewData } from '@/types/cart'
import { cn } from '@/utils/cn'
import { OrderSummary } from './order-summary'

interface CartViewProps {
  locale: Locale
  initialCart: CartViewData
  t: Dictionary['cart']['bag']
  couponReasons: Dictionary['errors']['coupon']
  genericError: string
}

export function CartView({ locale, initialCart, t, couponReasons, genericError }: CartViewProps) {
  const router = useRouter()
  const [cart, setCart] = useState(initialCart)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [couponInput, setCouponInput] = useState('')
  const [, startTransition] = useTransition()
  const track = useAnalytics()

  const money = (amount: number) => formatMoney(amount, locale)

  async function mutate(
    key: string,
    request: () => Promise<{ cart: CartViewData }>,
    success?: string,
  ) {
    setBusy(key)
    setMessage(null)
    try {
      const result = await request()
      setCart(result.cart)
      if (success) setMessage({ tone: 'success', text: success })
      // Refresh server components (header bag count).
      startTransition(() => router.refresh())
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof ApiClientError ? error.message : genericError,
      })
    } finally {
      setBusy(null)
    }
  }

  const setQuantity = (line: CartLineView, quantity: number) =>
    mutate(`qty-${line.id}`, () =>
      apiRequest<{ cart: CartViewData }>(`/api/cart/items/${line.id}`, {
        method: 'PATCH',
        body: { quantity },
        locale,
      }),
    )
  const remove = (line: CartLineView) =>
    mutate(`remove-${line.id}`, async () => {
      const result = await apiRequest<{ cart: CartViewData }>(`/api/cart/items/${line.id}`, {
        method: 'DELETE',
        locale,
      })
      track({ name: 'remove_from_cart', item: cartLineItem(line) })
      return result
    })
  const moveToWishlist = (line: CartLineView) =>
    mutate(`move-${line.id}`, () =>
      apiRequest<{ cart: CartViewData }>(`/api/cart/items/${line.id}/move-to-wishlist`, {
        method: 'POST',
        body: {},
        locale,
      }),
    )

  async function applyCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = couponInput.trim()
    if (!code) return
    await mutate(
      'coupon',
      () => apiRequest<{ cart: CartViewData }>('/api/cart/coupon', { body: { code }, locale }),
      interpolate(t.couponApplied, { code: code.toUpperCase() }),
    )
    setCouponInput('')
  }

  const removeCoupon = () =>
    mutate('coupon', () =>
      apiRequest<{ cart: CartViewData }>('/api/cart/coupon', { method: 'DELETE', locale }),
    )

  if (cart.lines.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 py-10" data-testid="cart-empty">
        <h2 className="font-display text-3xl text-ink">{t.empty}</h2>
        <p className="text-muted">{t.emptyText}</p>
        <ButtonLink href={`/${locale}/shop`} className="mt-2">
          {t.continueShopping}
        </ButtonLink>
      </div>
    )
  }

  const couponIssueText = cart.couponIssue
    ? interpolate(t.couponInvalid, {
        code: cart.couponIssue.code,
        reason: interpolate(couponReasons[cart.couponIssue.reason], {
          amount:
            cart.couponIssue.minOrderAmount !== undefined
              ? money(cart.couponIssue.minOrderAmount)
              : '',
        }),
      })
    : null
  const canCheckout = !cart.hasIssues && cart.totals.itemCount > 0

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_24rem] lg:gap-14">
      <div>
        <p className="text-sm text-muted">{plural(locale, cart.totals.itemCount, t.items)}</p>
        <div className="mt-4" aria-live="polite">
          {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
        </div>
        <ul className="mt-4 divide-y divide-line border-y border-line" data-testid="cart-lines">
          {cart.lines.map((line) => {
            const lineBusy = busy?.endsWith(line.id) ?? false
            return (
              <li
                key={line.id}
                className={cn('flex gap-4 py-6 sm:gap-6', lineBusy && 'opacity-60')}
                data-testid="cart-line"
              >
                <Link
                  href={line.href as Route}
                  className="relative block aspect-[4/5] w-24 shrink-0 overflow-hidden bg-sand sm:w-28"
                >
                  {line.image ? (
                    <Image
                      src={line.image.url}
                      alt={line.image.alt}
                      fill
                      sizes="112px"
                      className="object-cover"
                    />
                  ) : null}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Link
                        href={line.href as Route}
                        className="text-sm font-medium text-ink hover:underline"
                      >
                        {line.name}
                      </Link>
                      <p className="mt-1 text-xs text-muted">{line.variantName}</p>
                      <p className="ltr-nums mt-1 text-xs text-muted">{money(line.unitPrice)}</p>
                    </div>
                    <p className="ltr-nums shrink-0 text-sm font-medium text-ink">
                      {money(line.lineTotal)}
                    </p>
                  </div>
                  {line.issue ? (
                    <p className="text-xs text-danger" role="alert">
                      {interpolate(t.issues[line.issue], {
                        available: line.maxQuantity,
                        max: cart.maxQuantityPerItem,
                      })}
                    </p>
                  ) : null}
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                    {line.issue === 'unavailable' ? (
                      <span />
                    ) : (
                      <div
                        className="inline-flex items-center border border-line-strong"
                        role="group"
                        aria-label={t.quantity}
                      >
                        <button
                          type="button"
                          className="inline-flex size-9 items-center justify-center disabled:opacity-40"
                          aria-label={t.decrease}
                          disabled={lineBusy || line.quantity <= 1}
                          onClick={() => void setQuantity(line, line.quantity - 1)}
                        >
                          <Minus className="size-3.5" aria-hidden="true" />
                        </button>
                        <span className="ltr-nums w-9 text-center text-sm" aria-live="polite">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          className="inline-flex size-9 items-center justify-center disabled:opacity-40"
                          aria-label={t.increase}
                          disabled={lineBusy || line.quantity >= line.maxQuantity}
                          onClick={() => void setQuantity(line, line.quantity + 1)}
                        >
                          <Plus className="size-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-xs">
                      {line.issue !== 'unavailable' ? (
                        <button
                          type="button"
                          className="text-muted underline-offset-4 hover:text-ink hover:underline"
                          disabled={lineBusy}
                          onClick={() => void moveToWishlist(line)}
                        >
                          {t.moveToWishlist}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-muted hover:text-danger"
                        aria-label={interpolate(t.removeItem, { name: line.name })}
                        disabled={lineBusy}
                        onClick={() => void remove(line)}
                        data-testid="cart-remove"
                      >
                        <X className="size-3.5" aria-hidden="true" />
                        {t.remove}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
        <Link
          href={`/${locale}/shop` as Route}
          className="mt-6 inline-block text-sm underline underline-offset-4"
        >
          {t.continueShopping}
        </Link>
      </div>

      <div className="space-y-6 lg:sticky lg:top-36 lg:self-start">
        <OrderSummary locale={locale} t={t} totals={cart.totals}>
          {cart.hasIssues ? <p className="mb-4 text-xs text-danger">{t.resolveIssues}</p> : null}
          {canCheckout ? (
            <ButtonLink href={`/${locale}/checkout`} size="lg" fullWidth>
              {t.checkout}
            </ButtonLink>
          ) : (
            <span className={buttonClasses('primary', 'lg', true)} aria-disabled="true">
              {t.checkout}
            </span>
          )}
          <p className="mt-3 text-center text-xs text-muted">{t.secureNote}</p>
        </OrderSummary>

        <section aria-labelledby="coupon-title" className="border border-line bg-paper p-6">
          <h2 id="coupon-title" className="text-sm font-medium text-ink">
            {t.couponLabel}
          </h2>
          {cart.totals.coupon?.applied ? (
            <div className="mt-3 flex items-center justify-between gap-3 text-sm">
              <span className="ltr-nums font-medium">{cart.totals.coupon.code}</span>
              <button
                type="button"
                className="text-xs text-muted underline underline-offset-4"
                onClick={() => void removeCoupon()}
                disabled={busy === 'coupon'}
              >
                {t.removeCoupon}
              </button>
            </div>
          ) : (
            <>
              {couponIssueText ? (
                <div className="mt-3 space-y-2">
                  <Alert tone="warning">{couponIssueText}</Alert>
                  <button
                    type="button"
                    className="text-xs text-muted underline underline-offset-4"
                    onClick={() => void removeCoupon()}
                  >
                    {t.removeCoupon}
                  </button>
                </div>
              ) : null}
              <form onSubmit={(event) => void applyCoupon(event)} className="mt-3 flex gap-2">
                <label htmlFor="coupon-code" className="sr-only">
                  {t.couponLabel}
                </label>
                <input
                  id="coupon-code"
                  value={couponInput}
                  onChange={(event) => setCouponInput(event.target.value)}
                  placeholder={t.couponPlaceholder}
                  autoComplete="off"
                  autoCapitalize="characters"
                  maxLength={40}
                  dir="ltr"
                  className="h-11 min-w-0 flex-1 border border-line-strong bg-paper px-3 text-sm uppercase focus:border-ink focus:outline-none"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  loading={busy === 'coupon'}
                  loadingLabel={t.applyingCoupon}
                >
                  {t.applyCoupon}
                </Button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
