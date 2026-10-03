'use client'

import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useFragmentParam } from '@/hooks/use-fragment-param'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { apiRequest, ApiClientError } from '@/lib/client/api'

/** Explicit click (POST) so link scanners cannot unsubscribe people by prefetching the email link. */
export function UnsubscribeForm({
  locale,
  t,
  genericError,
}: {
  locale: Locale
  t: Dictionary['store']['newsletter']
  genericError: string
}) {
  const token = useFragmentParam('token')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function unsubscribe() {
    if (!token) return
    setStatus('submitting')
    setError(null)
    try {
      await apiRequest('/api/newsletter/unsubscribe', { body: { token }, locale })
      setStatus('done')
    } catch (caught) {
      setError(
        caught instanceof ApiClientError && caught.code === 'INVALID_OR_EXPIRED_TOKEN'
          ? t.invalidLink
          : genericError,
      )
      setStatus('idle')
    }
  }

  if (token === undefined) return <Spinner className="size-5 text-muted" />
  if (!token) return <Alert tone="warning">{t.invalidLink}</Alert>
  if (status === 'done') return <Alert tone="success">{t.unsubscribed}</Alert>
  return (
    <div className="space-y-5">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button
        size="lg"
        loading={status === 'submitting'}
        loadingLabel={t.unsubscribing}
        onClick={() => void unsubscribe()}
      >
        {t.unsubscribe}
      </Button>
    </div>
  )
}
