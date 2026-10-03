'use client'

import { useState } from 'react'
import { apiRequest, ApiClientError } from '@/lib/client/api'

interface VerificationBannerProps {
  locale: 'ar' | 'en'
  t: { banner: string; resend: string; resent: string }
  genericError: string
}

/** Shown while the email address is unconfirmed; lets the customer request a fresh link. */
export function VerificationBanner({ locale, t, genericError }: VerificationBannerProps) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function resend() {
    setState('sending')
    setError(null)
    try {
      await apiRequest('/api/auth/resend-verification', { method: 'POST', locale })
      setState('sent')
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : genericError)
      setState('idle')
    }
  }

  return (
    <div className="flex flex-col gap-2 border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning sm:flex-row sm:items-center sm:justify-between">
      <p>{state === 'sent' ? t.resent : t.banner}</p>
      {state === 'sent' ? null : (
        <button
          type="button"
          className="self-start font-medium underline underline-offset-4 disabled:opacity-60 sm:self-auto"
          onClick={() => void resend()}
          disabled={state === 'sending'}
        >
          {t.resend}
        </button>
      )}
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
