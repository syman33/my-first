'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Locale } from '@/i18n/config'
import { apiRequest, ApiClientError } from '@/lib/client/api'

/**
 * Starts (or resumes) the online payment for a pending order and sends the
 * customer to the payment page. The result is confirmed server-side only.
 */
export function PayOrderButton({
  locale,
  orderId,
  label,
  genericError,
}: {
  locale: Locale
  orderId: string
  label: string
  genericError: string
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pay() {
    setPending(true)
    setError(null)
    try {
      const { redirectUrl } = await apiRequest<{ redirectUrl: string }>(
        `/api/orders/${orderId}/pay`,
        { body: {}, locale },
      )
      window.location.assign(redirectUrl)
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : genericError)
      setPending(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={() => void pay()} loading={pending} data-testid="pay-order">
        {label}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
