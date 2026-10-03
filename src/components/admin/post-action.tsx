'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Textarea } from '@/components/ui/field'
import type { Locale } from '@/i18n/config'
import { ApiClientError, apiRequest } from '@/lib/client/api'

type Variant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger'

/** One-click POST action (optionally confirmed), then refresh the page's data. */
export function PostAction({
  locale,
  endpoint,
  body = {},
  label,
  variant = 'secondary',
  confirmText,
  confirmYes,
  cancelLabel,
  genericError,
  method = 'POST',
  doneMessage,
}: {
  locale: Locale
  endpoint: string
  body?: Record<string, unknown>
  label: string
  variant?: Variant
  confirmText?: string
  /** Label of the confirming button (defaults to the action label). */
  confirmYes?: string
  cancelLabel: string
  genericError: string
  method?: 'POST' | 'PATCH' | 'PUT'
  /** Shown after success, for actions whose effect is not visible on the page (e.g. an email sent). */
  doneMessage?: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function run() {
    setPending(true)
    setError(null)
    setDone(false)
    try {
      await apiRequest(endpoint, { body, locale, method })
      setConfirming(false)
      setDone(true)
      startTransition(() => router.refresh())
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : genericError)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {done && doneMessage ? (
        <p role="status" className="text-xs text-success">
          {doneMessage}
        </p>
      ) : null}
      {confirming && confirmText ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
          <span className="text-sm">{confirmText}</span>
          <Button
            size="sm"
            variant={variant === 'danger' ? 'danger' : 'primary'}
            loading={pending}
            onClick={() => void run()}
          >
            {confirmYes ?? label}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
            {cancelLabel}
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant={variant}
          loading={pending}
          onClick={() => (confirmText ? setConfirming(true) : void run())}
        >
          {label}
        </Button>
      )}
    </div>
  )
}

/** POST action that needs a written reason (suspensions, rejections); the reason is sent as `field`. */
export function ReasonAction({
  locale,
  endpoint,
  body = {},
  field = 'reason',
  label,
  reasonLabel,
  hint,
  variant = 'secondary',
  minLength = 3,
  tooShort,
  genericError,
  cancelLabel,
}: {
  locale: Locale
  endpoint: string
  body?: Record<string, unknown>
  field?: string
  label: string
  reasonLabel: string
  hint?: string
  variant?: Variant
  minLength?: number
  tooShort: string
  genericError: string
  cancelLabel: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (reason.trim().length < minLength) {
      setFieldError(tooShort)
      return
    }
    setFieldError(null)
    setPending(true)
    try {
      await apiRequest(endpoint, { body: { ...body, [field]: reason.trim() }, locale })
      setOpen(false)
      setReason('')
      startTransition(() => router.refresh())
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : genericError)
    } finally {
      setPending(false)
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant={variant} onClick={() => setOpen(true)} aria-expanded={false}>
        {label}
      </Button>
    )
  }
  return (
    <div className="space-y-3 border border-line bg-ivory/60 p-4">
      {hint ? <p className="text-sm text-text">{hint}</p> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field label={reasonLabel} error={fieldError ?? undefined}>
        {(props) => (
          <Textarea
            {...props}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="min-h-20"
            maxLength={300}
          />
        )}
      </Field>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={variant === 'danger' ? 'danger' : 'primary'}
          loading={pending}
          onClick={() => void submit()}
        >
          {label}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  )
}
