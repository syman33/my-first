'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { apiRequest, ApiClientError } from '@/lib/client/api'

interface AddToBagProps {
  locale: Locale
  variantId: string | null
  soldOut: boolean
  t: Dictionary['cart']['addToBag']
  genericError: string
}

/** Adds the selected variant; the server validates stock and limits and recomputes everything. */
export function AddToBag({ locale, variantId, soldOut, t, genericError }: AddToBagProps) {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'adding' | 'added'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function add() {
    if (!variantId) return
    setStatus('adding')
    setError(null)
    try {
      await apiRequest('/api/cart/items', { body: { variantId, quantity: 1 }, locale })
      setStatus('added')
      startTransition(() => router.refresh())
    } catch (caught) {
      setStatus('idle')
      setError(caught instanceof ApiClientError ? caught.message : genericError)
    }
  }

  const disabled = !variantId || soldOut
  return (
    <div className="space-y-3">
      <Button
        size="lg"
        fullWidth
        onClick={() => void add()}
        disabled={disabled}
        loading={status === 'adding'}
        loadingLabel={t.adding}
        data-testid="add-to-bag"
      >
        {soldOut ? t.soldOut : variantId ? t.add : t.chooseOption}
      </Button>
      <div role="status" aria-live="polite" className="min-h-5 text-sm">
        {status === 'added' ? (
          <p className="flex flex-wrap items-center gap-2 text-success">
            {t.added}
            <Link
              href={`/${locale}/cart` as Route}
              className="text-ink underline underline-offset-4"
            >
              {t.viewBag}
            </Link>
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
