'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { ApiClientError, apiRequest } from '@/lib/client/api'

/** Two-step withdrawal of a return still under review; the server re-checks the status. */
export function WithdrawReturnButton({
  locale,
  returnId,
  t,
  genericError,
}: {
  locale: Locale
  returnId: string
  t: Dictionary['orders']['returns']
  genericError: string
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function withdraw() {
    setPending(true)
    setError(null)
    try {
      await apiRequest(`/api/returns/${returnId}/cancel`, { body: {}, locale })
      setConfirming(false)
      startTransition(() => router.refresh())
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        const reason = caught.details.reason
        setError(
          typeof reason === 'string' && reason in t.errors
            ? t.errors[reason as keyof typeof t.errors]
            : caught.message,
        )
      } else {
        setError(genericError)
      }
    } finally {
      setPending(false)
    }
  }

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        {t.withdraw}
      </Button>
    )
  }
  return (
    <div className="space-y-3" role="group" aria-label={t.withdraw}>
      <p className="text-sm text-text">{t.withdrawConfirm}</p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex flex-wrap gap-3">
        <Button variant="danger" size="sm" loading={pending} onClick={() => void withdraw()}>
          {t.withdrawYes}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
          {t.withdrawNo}
        </Button>
      </div>
    </div>
  )
}
