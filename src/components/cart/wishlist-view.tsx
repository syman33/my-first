'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Price } from '@/components/catalog/price'
import { Alert } from '@/components/ui/alert'
import { Button, ButtonLink } from '@/components/ui/button'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { apiRequest, ApiClientError } from '@/lib/client/api'
import type { WishlistEntryView } from '@/types/wishlist'

interface WishlistViewProps {
  locale: Locale
  entries: WishlistEntryView[]
  t: Dictionary['cart']['wishlist']
  cardT: Dictionary['store']['card']
  continueShopping: string
  removeLabel: string
  genericError: string
  signedIn: boolean
  loginHref: string
}

export function WishlistView({
  locale,
  entries: initial,
  t,
  cardT,
  continueShopping,
  removeLabel,
  genericError,
  signedIn,
  loginHref,
}: WishlistViewProps) {
  const router = useRouter()
  const [entries, setEntries] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function act(productId: string, request: () => Promise<unknown>) {
    setBusy(productId)
    setError(null)
    try {
      await request()
      setEntries((current) => current.filter((entry) => entry.productId !== productId))
      startTransition(() => router.refresh())
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : genericError)
    } finally {
      setBusy(null)
    }
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 py-10" data-testid="wishlist-empty">
        <h2 className="font-display text-3xl text-ink">{t.empty}</h2>
        <p className="text-muted">{t.emptyText}</p>
        <ButtonLink href={`/${locale}/shop`} className="mt-2">
          {continueShopping}
        </ButtonLink>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {!signedIn ? (
        <p className="text-sm text-muted">
          <Link href={loginHref as Route} className="underline underline-offset-4">
            {t.guestNote}
          </Link>
        </p>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:gap-x-6 xl:grid-cols-4">
        {entries.map(({ productId, card, available, moveVariantId }) => (
          <li key={productId} className="flex flex-col" data-testid="wishlist-item">
            <Link
              href={card.href as Route}
              className="relative block aspect-[4/5] overflow-hidden bg-sand"
            >
              {card.image ? (
                <Image
                  src={card.image.url}
                  alt={card.image.alt}
                  fill
                  sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 46vw"
                  className="object-cover"
                />
              ) : null}
            </Link>
            <p className="mt-4 text-[11px] text-muted">{card.brandName ?? card.categoryName}</p>
            <Link href={card.href as Route} className="text-sm text-ink hover:underline">
              {card.name}
            </Link>
            <Price
              locale={locale}
              t={cardT}
              price={card.price}
              compareAtPrice={card.compareAtPrice}
              priceFrom={card.priceFrom}
              className="mt-1"
            />
            {!available ? <p className="mt-1 text-xs text-danger">{t.unavailable}</p> : null}
            <div className="mt-4 flex flex-col gap-2">
              {available && moveVariantId ? (
                <Button
                  size="sm"
                  loading={busy === productId}
                  onClick={() =>
                    void act(productId, () =>
                      apiRequest(`/api/wishlist/items/${productId}/move-to-cart`, {
                        body: { variantId: moveVariantId },
                        locale,
                      }),
                    )
                  }
                >
                  {t.moveToBag}
                </Button>
              ) : available ? (
                <ButtonLink href={card.href as Route} size="sm" variant="secondary">
                  {t.chooseOptions}
                </ButtonLink>
              ) : null}
              <button
                type="button"
                className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
                disabled={busy === productId}
                onClick={() =>
                  void act(productId, () =>
                    apiRequest(`/api/wishlist/items/${productId}`, { method: 'DELETE', locale }),
                  )
                }
              >
                {/* The accessible name starts with the visible word (WCAG 2.5.3, voice control). */}
                {removeLabel}
                <span className="sr-only"> {card.name}</span>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
