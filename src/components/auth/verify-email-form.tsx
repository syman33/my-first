'use client'

import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button, ButtonLink } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useFragmentParam } from '@/hooks/use-fragment-param'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { apiRequest, ApiClientError } from '@/lib/client/api'

interface VerifyEmailFormProps {
  locale: Locale
  t: Dictionary['auth']['verify']
  genericError: string
}

/**
 * Confirmation needs an explicit click (a POST): mail scanners that pre-fetch
 * links must not be able to confirm an address on the user's behalf.
 */
export function VerifyEmailForm({ locale, t, genericError }: VerifyEmailFormProps) {
  const token = useFragmentParam('token')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (!token) return
    setStatus('submitting')
    setError(null)
    try {
      await apiRequest('/api/auth/verify-email', { body: { token }, locale })
      setStatus('done')
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : genericError)
      setStatus('idle')
    }
  }

  if (token === undefined) return <Spinner className="size-5 text-muted" />
  if (!token) return <Alert tone="warning">{t.missingToken}</Alert>

  if (status === 'done') {
    return (
      <div className="space-y-6" data-testid="verify-email-success">
        <Alert tone="success" title={t.successTitle}>
          {t.success}
        </Alert>
        <ButtonLink href={`/${locale}`}>{t.continue}</ButtonLink>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button
        size="lg"
        fullWidth
        loading={status === 'submitting'}
        loadingLabel={t.submitting}
        onClick={() => void confirm()}
      >
        {t.submit}
      </Button>
    </div>
  )
}
