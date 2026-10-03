'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { ApiClientError, apiRequest } from '@/lib/client/api'
import { inputToInt } from './form-helpers'

type Labels = Dictionary['admin']['inventory']

interface Values {
  type: 'RESTOCK' | 'DAMAGE_WRITE_OFF' | 'COUNT'
  quantity: string
  reason: string
}

/** Record a stock movement with its reason (the server keeps on-hand ≥ reserved). */
export function AdjustStockForm({
  locale,
  variantId,
  t,
  submitLabel,
  fieldMessages,
  genericError,
}: {
  locale: Locale
  variantId: string
  t: Labels
  submitLabel: string
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [message, setMessage] = useState<{
    tone: 'success' | 'error' | 'info'
    text: string
  } | null>(null)
  const { register, handleSubmit, setError, reset, control, formState } = useForm<Values>({
    defaultValues: { type: 'RESTOCK', quantity: '', reason: '' },
  })
  const type = useWatch({ control, name: 'type' })

  async function submit(values: Values) {
    setMessage(null)
    const amount = inputToInt(values.quantity)
    if (amount === undefined || amount === null || (values.type !== 'COUNT' && amount === 0)) {
      setError('quantity', { type: 'validate', message: fieldMessages.quantity })
      return
    }
    if (values.reason.trim().length < 3) {
      setError('reason', { type: 'validate', message: fieldMessages.tooShort })
      return
    }
    const body =
      values.type === 'COUNT'
        ? { type: 'COUNT', counted: amount, reason: values.reason }
        : { type: values.type, quantity: amount, reason: values.reason }
    try {
      const result = await apiRequest<{ stock: { delta: number } }>(
        `/api/admin/variants/${variantId}/stock`,
        { body, locale },
      )
      setMessage({
        tone: result.stock.delta === 0 ? 'info' : 'success',
        text: result.stock.delta === 0 ? t.noChange : t.done,
      })
      reset({ type: values.type, quantity: '', reason: '' })
      startTransition(() => router.refresh())
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.details.reason : undefined
      setMessage({
        tone: 'error',
        text:
          reason === 'BELOW_RESERVED'
            ? t.belowReserved
            : error instanceof ApiClientError
              ? error.message
              : genericError,
      })
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(submit)(event)}
      noValidate
      className="space-y-4"
      data-testid="adjust-stock-form"
    >
      {message ? (
        <Alert tone={message.tone === 'info' ? 'info' : message.tone}>{message.text}</Alert>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={t.type}>
          {(field) => (
            <Select {...field} {...register('type')}>
              {(['RESTOCK', 'DAMAGE_WRITE_OFF', 'COUNT'] as const).map((option) => (
                <option key={option} value={option}>
                  {t.types[option]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label={type === 'COUNT' ? t.counted : t.quantity}
          error={formState.errors.quantity?.message}
        >
          {(field) => <Input {...field} {...register('quantity')} inputMode="numeric" dir="ltr" />}
        </Field>
        <Field label={t.reason} error={formState.errors.reason?.message}>
          {(field) => <Input {...field} {...register('reason')} maxLength={300} />}
        </Field>
      </div>
      <Button
        type="submit"
        size="sm"
        loading={formState.isSubmitting}
        data-testid="adjust-stock-submit"
      >
        {submitLabel}
      </Button>
    </form>
  )
}
