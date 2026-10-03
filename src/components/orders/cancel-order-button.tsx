'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { apiRequest, ApiClientError } from '@/lib/client/api'

/** Two-step cancellation (confirm inline); the server decides whether it is still allowed. */
export function CancelOrderButton({
  locale,
  orderId,
  t,
  genericError,
}: {
  locale: Locale
  orderId: string
  t: Dictionary['orders']['detail']
  genericError: string
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function cancel() {
    setPending(true)
    setError(null)
    try {
      await apiRequest(`/api/orders/${orderId}/cancel`, { body: {}, locale })
      setConfirming(false)
      startTransition(() => router.refresh())
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : genericError)
    } finally {
      setPending(false)
    }
  }

  if (!confirming) {
    return (
      <Button variant="secondary" onClick={() => setConfirming(true)} data-testid="cancel-order">
        {t.cancel}
      </Button>
    )
  }
  return (
    <div className="space-y-3 border border-line bg-paper p-4" role="group" aria-label={t.cancel}>
      <p className="text-sm text-text">{t.cancelConfirm}</p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="danger"
          size="sm"
          loading={pending}
          onClick={() => void cancel()}
          data-testid="cancel-order-confirm"
        >
          {t.cancelYes}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
          {t.cancelNo}
        </Button>
      </div>
    </div>
  )
}
