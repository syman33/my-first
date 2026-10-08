'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { type Dictionary, interpolate } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { formatMoney } from '@/i18n/format'
import { ApiClientError, apiRequest } from '@/lib/client/api'
import { applyServerErrors, localizeResolver } from '@/lib/client/forms'
import type { ReturnStatus } from '@/generated/prisma/enums'
import { halalasToSarString, sarToHalalas } from '@/utils/money'

type Labels = Dictionary['admin']['returns']

interface ReturnActionsProps {
  locale: Locale
  returnId: string
  status: ReturnStatus
  items: { id: string; name: string; quantity: number }[]
  quote: { suggested: number; refundable: number; manual: boolean; hasPayment: boolean } | null
  canManage: boolean
  canRefund: boolean
  t: Labels
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
}

/** Step-by-step return handling: review → receive & inspect → refund & close. */
export function ReturnActions(props: ReturnActionsProps) {
  const { status, canManage, canRefund, t } = props
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [message, setMessage] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null)
  const done = (text: string, tone: 'success' | 'warning' = 'success') => {
    setMessage({ tone, text })
    startTransition(() => router.refresh())
  }
  return (
    <div className="space-y-4" data-testid="return-actions">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      {status === 'REQUESTED' && canManage ? (
        <ReviewForms {...props} onDone={() => done(t.actions.done)} />
      ) : null}
      {status === 'APPROVED' && canManage ? (
        <ReceiveForm {...props} onDone={() => done(t.actions.done)} />
      ) : null}
      {status === 'RECEIVED' && canRefund ? (
        <CompleteForm
          {...props}
          onDone={(pending) =>
            pending ? done(t.actions.pending, 'warning') : done(t.actions.done)
          }
        />
      ) : null}
    </div>
  )
}

const noteSchema = z.object({ note: z.string().trim().max(1000, { error: 'tooLong' }) })

function ReviewForms({
  locale,
  returnId,
  t,
  fieldMessages,
  genericError,
  onDone,
}: ReturnActionsProps & { onDone: () => void }) {
  const [mode, setMode] = useState<'approve' | 'reject'>('approve')
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, setError, formState } = useForm<
    z.input<typeof noteSchema>,
    unknown,
    z.output<typeof noteSchema>
  >({
    resolver: localizeResolver(zodResolver(noteSchema), fieldMessages),
    defaultValues: { note: '' },
  })
  async function submit(values: z.output<typeof noteSchema>) {
    setFormError(null)
    if (mode === 'reject' && values.note.length < 3) {
      setError('note', { type: 'required', message: fieldMessages.required })
      return
    }
    try {
      await apiRequest(`/api/admin/returns/${returnId}/${mode}`, {
        body: { note: values.note || null },
        locale,
      })
      onDone()
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['note'], genericError))
    }
  }
  return (
    <form onSubmit={(event) => void handleSubmit(submit)(event)} noValidate className="space-y-4">
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="mode"
            checked={mode === 'approve'}
            onChange={() => setMode('approve')}
            className="accent-ink"
          />
          {t.actions.approve}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="mode"
            checked={mode === 'reject'}
            onChange={() => setMode('reject')}
            className="accent-ink"
          />
          {t.actions.reject}
        </label>
      </fieldset>
      <Field
        label={mode === 'approve' ? t.actions.approveNote : t.actions.rejectNote}
        error={formState.errors.note?.message}
      >
        {(field) => (
          <Textarea {...field} {...register('note')} className="min-h-20" maxLength={1000} />
        )}
      </Field>
      <Button
        type="submit"
        size="sm"
        variant={mode === 'reject' ? 'danger' : 'primary'}
        loading={formState.isSubmitting}
        data-testid="return-review-submit"
      >
        {mode === 'approve' ? t.actions.approve : t.actions.reject}
      </Button>
    </form>
  )
}

function ReceiveForm({
  locale,
  returnId,
  items,
  t,
  genericError,
  onDone,
}: ReturnActionsProps & { onDone: () => void }) {
  const [conditions, setConditions] = useState<Record<string, 'SELLABLE' | 'DAMAGED'>>(() =>
    Object.fromEntries(items.map((item) => [item.id, 'SELLABLE' as const])),
  )
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit() {
    setPending(true)
    setError(null)
    try {
      await apiRequest(`/api/admin/returns/${returnId}/receive`, {
        body: {
          items: items.map((item) => ({
            returnItemId: item.id,
            condition: conditions[item.id] ?? 'SELLABLE',
          })),
          note: note.trim() || null,
        },
        locale,
      })
      onDone()
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : genericError)
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-text">{t.actions.receiveHint}</p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <ul className="divide-y divide-line border-y border-line">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
          >
            <span>
              {item.name} × <span className="tabular-nums">{item.quantity}</span>
            </span>
            <Select
              className="h-10 w-auto min-w-56"
              aria-label={`${t.detail.condition}: ${item.name}`}
              value={conditions[item.id]}
              onChange={(event) =>
                setConditions((current) => ({
                  ...current,
                  [item.id]: event.target.value === 'DAMAGED' ? 'DAMAGED' : 'SELLABLE',
                }))
              }
            >
              <option value="SELLABLE">{t.detail.conditions.SELLABLE}</option>
              <option value="DAMAGED">{t.detail.conditions.DAMAGED}</option>
            </Select>
          </li>
        ))}
      </ul>
      <Field label={t.actions.note}>
        {(field) => (
          <Textarea
            {...field}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="min-h-20"
            maxLength={1000}
          />
        )}
      </Field>
      <Button
        size="sm"
        loading={pending}
        onClick={() => void submit()}
        data-testid="return-receive-submit"
      >
        {t.actions.receiveSubmit}
      </Button>
    </div>
  )
}

const completeSchema = z.object({
  amount: z.string().trim().min(1, { error: 'required' }),
  note: z.string().trim().max(1000, { error: 'tooLong' }),
  transferReference: z.string().trim().max(100, { error: 'tooLong' }),
})

function CompleteForm({
  locale,
  returnId,
  quote,
  t,
  fieldMessages,
  genericError,
  onDone,
}: ReturnActionsProps & { onDone: (pending: boolean) => void }) {
  const [formError, setFormError] = useState<string | null>(null)
  const suggested = quote ? Math.min(quote.suggested, quote.refundable) : 0
  const { register, handleSubmit, setError, formState } = useForm<
    z.input<typeof completeSchema>,
    unknown,
    z.output<typeof completeSchema>
  >({
    resolver: localizeResolver(zodResolver(completeSchema), fieldMessages),
    defaultValues: { amount: halalasToSarString(suggested), note: '', transferReference: '' },
  })
  if (!quote) return null
  const manual = quote.manual

  async function submit(values: z.output<typeof completeSchema>) {
    setFormError(null)
    let amount: number
    try {
      amount = sarToHalalas(values.amount)
    } catch {
      setError('amount', { type: 'validate', message: fieldMessages.amount })
      return
    }
    if (amount < 0 || (quote && amount > quote.refundable)) {
      setError('amount', { type: 'validate', message: fieldMessages.amount })
      return
    }
    if (quote && amount !== quote.suggested && !values.note) {
      setError('note', { type: 'required', message: fieldMessages.required })
      return
    }
    if (manual && amount > 0 && !values.transferReference) {
      setError('transferReference', { type: 'required', message: fieldMessages.required })
      return
    }
    try {
      const result = await apiRequest<{ status: 'COMPLETED' | 'REFUND_PENDING' }>(
        `/api/admin/returns/${returnId}/complete`,
        {
          body: {
            amount,
            note: values.note || null,
            transferReference: values.transferReference || null,
          },
          locale,
        },
      )
      onDone(result.status === 'REFUND_PENDING')
    } catch (error) {
      setFormError(
        applyServerErrors(error, setError, ['amount', 'note', 'transferReference'], genericError),
      )
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(submit)(event)}
      noValidate
      className="space-y-4"
      data-testid="return-complete-form"
    >
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      {!quote.hasPayment ? <Alert tone="warning">{t.actions.noPayment}</Alert> : null}
      {manual ? <p className="text-sm text-text">{t.actions.codHint}</p> : null}
      <div className="space-y-1 text-sm text-muted">
        <p>{interpolate(t.actions.suggested, { amount: formatMoney(quote.suggested, locale) })}</p>
        <p>
          {interpolate(t.actions.refundable, { amount: formatMoney(quote.refundable, locale) })}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t.actions.amount}
          hint={t.actions.amountHint}
          error={formState.errors.amount?.message}
        >
          {(field) => (
            <Input
              {...field}
              {...register('amount')}
              inputMode="decimal"
              dir="ltr"
              autoComplete="off"
            />
          )}
        </Field>
        {manual ? (
          <Field
            label={t.actions.transferReference}
            error={formState.errors.transferReference?.message}
          >
            {(field) => (
              <Input {...field} {...register('transferReference')} dir="ltr" maxLength={100} />
            )}
          </Field>
        ) : null}
      </div>
      <Field label={t.actions.note} error={formState.errors.note?.message}>
        {(field) => (
          <Textarea {...field} {...register('note')} className="min-h-20" maxLength={1000} />
        )}
      </Field>
      <Button
        type="submit"
        size="sm"
        loading={formState.isSubmitting}
        data-testid="return-complete-submit"
      >
        {t.actions.completeSubmit}
      </Button>
    </form>
  )
}
