'use client'

import { Heart } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useAnalytics } from '@/components/analytics/analytics-provider'
import { interpolate } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { apiRequest } from '@/lib/client/api'
import { cn } from '@/utils/cn'

interface WishlistButtonProps {
  locale: Locale
  productId: string
  productName: string
  /** Unit price in halalas (analytics only; the server prices everything else). */
  price: number
  variantId?: string | null
  initialActive: boolean
  labels: { add: string; remove: string; added: string; removed: string; error: string }
  variant?: 'icon' | 'outline'
  className?: string
}

/** Heart toggle (optimistic, rolled back on failure); works for guests too. */
export function WishlistButton({
  locale,
  productId,
  productName,
  price,
  variantId,
  initialActive,
  labels,
  variant = 'icon',
  className,
}: WishlistButtonProps) {
  const router = useRouter()
  const [active, setActive] = useState(initialActive)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const track = useAnalytics()

  async function toggle() {
    const next = !active
    setActive(next)
    setMessage(null)
    try {
      if (next) {
        await apiRequest('/api/wishlist/items', {
          body: { productId, variantId: variantId ?? null },
          locale,
        })
        track({
          name: 'add_to_wishlist',
          item: { id: productId, name: productName, price, quantity: 1 },
        })
      } else {
        await apiRequest(`/api/wishlist/items/${productId}`, { method: 'DELETE', locale })
      }
      setMessage(next ? labels.added : labels.removed)
      startTransition(() => router.refresh())
    } catch {
      setActive(!next)
      setMessage(labels.error)
    }
  }

  const label = interpolate(active ? labels.remove : labels.add, { name: productName })
  return (
    <>
      <button
        type="button"
        onClick={() => void toggle()}
        aria-pressed={active}
        aria-label={label}
        title={label}
        disabled={pending}
        className={cn(
          variant === 'icon'
            ? 'inline-flex size-9 items-center justify-center rounded-full bg-paper/90 text-ink shadow-sm transition hover:bg-paper'
            : 'inline-flex size-12 shrink-0 items-center justify-center border border-line-strong text-ink transition hover:border-ink',
          className,
        )}
        data-testid="wishlist-toggle"
      >
        <Heart
          className={cn('size-4', active && 'fill-ink')}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {message}
      </span>
    </>
  )
}
