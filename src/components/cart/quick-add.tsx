'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useAnalytics } from '@/components/analytics/analytics-provider'
import { interpolate } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { apiRequest, ApiClientError } from '@/lib/client/api'
import { addedItem } from '@/lib/analytics/cart'
import type { CartView } from '@/types/cart'

interface QuickAddProps {
  locale: Locale
  variantId: string
  productName: string
  labels: { add: string; adding: string; added: string; quickAdd: string; error: string }
}

/** One-tap add for products with a single sellable option. */
export function QuickAdd({ locale, variantId, productName, labels }: QuickAddProps) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'adding' | 'added' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const track = useAnalytics()

  async function add() {
    setState('adding')
    try {
      const { cart } = await apiRequest<{ cart: CartView }>('/api/cart/items', {
        body: { variantId, quantity: 1 },
        locale,
      })
      const item = addedItem(cart, variantId, 1)
      if (item) track({ name: 'add_to_cart', item })
      setState('added')
      startTransition(() => router.refresh())
    } catch (caught) {
      setState('error')
      setError(caught instanceof ApiClientError ? caught.message : labels.error)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void add()}
        disabled={state === 'adding'}
        aria-label={interpolate(labels.quickAdd, { name: productName })}
        className="w-full bg-paper/95 py-2.5 text-xs font-medium tracking-wide text-ink transition hover:bg-ink hover:text-paper disabled:opacity-60"
      >
        {state === 'adding' ? labels.adding : state === 'added' ? labels.added : labels.add}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'added' ? labels.added : state === 'error' ? error : null}
      </span>
    </>
  )
}
