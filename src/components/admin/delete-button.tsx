'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { Locale } from '@/i18n/config'
import { ApiClientError, apiRequest } from '@/lib/client/api'

/** Two-step delete: the first click asks, the second sends DELETE; the server decides if it is allowed. */
export function DeleteButton({
  locale,
  endpoint,
  label,
  confirmText,
  yesLabel,
  noLabel,
  redirectTo,
  reasons = {},
  genericError,
  size = 'sm',
}: {
  locale: Locale
  endpoint: string
  label: string
  confirmText: string
  yesLabel: string
  noLabel: string
  redirectTo?: string
  /** Messages for known `details.reason` values from the API. */
  reasons?: Record<string, string>
  genericError: string
  size?: 'sm' | 'md'
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setPending(true)
    setError(null)
    try {
      await apiRequest(endpoint, { method: 'DELETE', locale })
      setConfirming(false)
      startTransition(() => {
        if (redirectTo) router.replace(redirectTo as Route)
        router.refresh()
      })
    } catch (caught) {
      const reason = caught instanceof ApiClientError ? caught.details.reason : undefined
      setError(
        typeof reason === 'string' && reasons[reason]
          ? reasons[reason]
          : caught instanceof ApiClientError
            ? caught.message
            : genericError,
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
          <span className="text-sm text-text">{confirmText}</span>
          <Button size={size} variant="danger" loading={pending} onClick={() => void remove()}>
            {yesLabel}
          </Button>
          <Button
            size={size}
            variant="ghost"
            onClick={() => setConfirming(false)}
            disabled={pending}
          >
            {noLabel}
          </Button>
        </div>
      ) : (
        <Button
          size={size}
          variant="ghost"
          className="text-danger"
          onClick={() => setConfirming(true)}
        >
          {label}
        </Button>
      )}
    </div>
  )
}
