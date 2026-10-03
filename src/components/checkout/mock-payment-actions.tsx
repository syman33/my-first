'use client'

import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { apiRequest, ApiClientError } from '@/lib/client/api'

type Outcome = 'SUCCESS' | 'FAILED' | 'CANCELLED'

export function MockPaymentActions({
  locale,
  providerPaymentId,
  t,
  genericError,
}: {
  locale: Locale
  providerPaymentId: string
  t: Dictionary['checkout']['mock']
  genericError: string
}) {
  const [pending, setPending] = useState<Outcome | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function simulate(outcome: Outcome) {
    setPending(outcome)
    setError(null)
    try {
      const { redirectUrl } = await apiRequest<{ redirectUrl: string }>(
        '/api/payments/mock/simulate',
        {
          body: { providerPaymentId, outcome },
          locale,
        },
      )
      window.location.assign(redirectUrl)
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : genericError)
      setPending(null)
    }
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button
        fullWidth
        size="lg"
        loading={pending === 'SUCCESS'}
        disabled={pending !== null}
        onClick={() => void simulate('SUCCESS')}
        data-testid="mock-pay-success"
      >
        {t.success}
      </Button>
      <Button
        fullWidth
        variant="secondary"
        loading={pending === 'FAILED'}
        disabled={pending !== null}
        onClick={() => void simulate('FAILED')}
        data-testid="mock-pay-failed"
      >
        {t.failed}
      </Button>
      <Button
        fullWidth
        variant="ghost"
        loading={pending === 'CANCELLED'}
        disabled={pending !== null}
        onClick={() => void simulate('CANCELLED')}
        data-testid="mock-pay-cancelled"
      >
        {t.cancelled}
      </Button>
    </div>
  )
}
