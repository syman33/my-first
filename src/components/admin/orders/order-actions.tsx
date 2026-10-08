'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import * as z from 'zod'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { type Dictionary, interpolate } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { formatMoney } from '@/i18n/format'
import { ApiClientError, apiRequest } from '@/lib/client/api'
import { applyServerErrors, localizeResolver } from '@/lib/client/forms'
import type { AdminOrderActions, AdminPaymentView } from '@/types/admin-orders'
import { sarToHalalas } from '@/utils/money'

type Labels = Dictionary['admin']['orders']['actions']
type Panel = 'ship' | 'cancel' | 'refund' | 'resolve' | null
type Step = 'confirm' | 'process' | 'out-for-delivery' | 'deliver'

const CARRIERS = ['SPL', 'SMSA', 'ARAMEX', 'NAQEL', 'DHL'] as const

interface OrderActionsProps {
  locale: Locale
  orderId: string
  actions: AdminOrderActions
  isCod: boolean
  payments: AdminPaymentView[]
  simulatedShipping: boolean
  canManage: boolean
  canRefund: boolean
  t: Labels
  paymentMethodNames: Dictionary['paymentMethodNames']
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
}

/**
 * Staff actions for one order. Only the steps the order's state allows are
 * offered, and the server re-checks every one of them.
 */
export function OrderActions(props: OrderActionsProps) {
  const { locale, orderId, actions, isCod, t, canManage, canRefund, genericError } = props
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [panel, setPanel] = useState<Panel>(null)
  const [confirming, setConfirming] = useState<Step | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{
    tone: 'success' | 'error' | 'warning'
    text: string
  } | null>(null)

  function done(text: string, tone: 'success' | 'warning' = 'success') {
    setPanel(null)
    setConfirming(null)
    setMessage({ tone, text })
    startTransition(() => router.refresh())
  }

  async function runStep(step: Step) {
    setPending(true)
    setMessage(null)
    try {
      await apiRequest(`/api/admin/orders/${orderId}/${step}`, { body: {}, locale })
      done(t.done)
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof ApiClientError ? error.message : genericError,
      })
    } finally {
      setPending(false)
    }
  }

  const steps: { step: Step; label: string; show: boolean; hint?: string }[] = [
    { step: 'confirm', label: t.confirm, show: canManage && actions.confirm, hint: t.confirmHint },
    { step: 'process', label: t.process, show: canManage && actions.process },
    {
      step: 'out-for-delivery',
      label: t.outForDelivery,
      show: canManage && actions.outForDelivery,
    },
    {
      step: 'deliver',
      label: t.deliver,
      show: canManage && actions.deliver,
      hint: isCod ? t.deliverCodHint : undefined,
    },
  ]
  const visibleSteps = steps.filter((entry) => entry.show)
  const panels: {
    key: Exclude<Panel, null>
    label: string
    show: boolean
    variant: 'primary' | 'secondary' | 'danger'
  }[] = [
    { key: 'ship', label: t.ship, show: canManage && actions.ship, variant: 'primary' },
    { key: 'refund', label: t.refund, show: canRefund && actions.refund, variant: 'secondary' },
    {
      key: 'resolve',
      label: t.resolve,
      show: canManage && actions.resolveAttention,
      variant: 'secondary',
    },
    { key: 'cancel', label: t.cancel, show: canManage && actions.cancel, variant: 'danger' },
  ]
  const visiblePanels = panels.filter((entry) => entry.show)

  if (visibleSteps.length === 0 && visiblePanels.length === 0) {
    return <p className="text-sm text-muted">{t.none}</p>
  }

  return (
    <div className="space-y-4" data-testid="order-actions">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        {visibleSteps.map((entry) => (
          <Button
            key={entry.step}
            size="sm"
            variant={confirming === entry.step ? 'primary' : 'secondary'}
            onClick={() => {
              setPanel(null)
              setConfirming(entry.step)
            }}
            disabled={pending}
            data-testid={`action-${entry.step}`}
          >
            {entry.label}
          </Button>
        ))}
        {visiblePanels.map((entry) => (
          <Button
            key={entry.key}
            size="sm"
            variant={
              panel === entry.key ? 'primary' : entry.variant === 'danger' ? 'ghost' : 'secondary'
            }
            className={
              entry.variant === 'danger' && panel !== entry.key ? 'text-danger' : undefined
            }
            onClick={() => {
              setConfirming(null)
              setPanel(panel === entry.key ? null : entry.key)
            }}
            aria-expanded={panel === entry.key}
            data-testid={`action-${entry.key}`}
          >
            {entry.label}
          </Button>
        ))}
      </div>

      {confirming ? (
        <div
          className="space-y-3 border border-line bg-ivory/60 p-4"
          role="group"
          aria-label={steps.find((s) => s.step === confirming)?.label}
        >
          {steps.find((s) => s.step === confirming)?.hint ? (
            <p className="text-sm text-text">{steps.find((s) => s.step === confirming)?.hint}</p>
          ) : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={pending}
              onClick={() => void runStep(confirming)}
              data-testid="action-confirm-step"
            >
              {steps.find((s) => s.step === confirming)?.label}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(null)}
              disabled={pending}
            >
              {t.close}
            </Button>
          </div>
        </div>
      ) : null}

      {panel === 'ship' ? (
        <ShipForm {...props} onDone={() => done(t.done)} onClose={() => setPanel(null)} />
      ) : null}
      {panel === 'cancel' ? (
        <CancelForm {...props} onDone={() => done(t.done)} onClose={() => setPanel(null)} />
      ) : null}
      {panel === 'resolve' ? (
        <ResolveForm {...props} onDone={() => done(t.done)} onClose={() => setPanel(null)} />
      ) : null}
      {panel === 'refund' ? (
        <RefundForm
          {...props}
          onDone={(status) =>
            status === 'SUCCEEDED'
              ? done(t.refundResult.SUCCEEDED)
              : status === 'PENDING'
                ? done(t.refundResult.PENDING, 'warning')
                : setMessage({ tone: 'error', text: t.refundResult.FAILED })
          }
          onClose={() => setPanel(null)}
        />
      ) : null}
    </div>
  )
}

interface SubFormProps extends OrderActionsProps {
  onDone: () => void
  onClose: () => void
}

const shipFormSchema = z.object({
  carrier: z.string(),
  carrierName: z.string().trim().max(64, { error: 'tooLong' }),
  trackingNumber: z
    .string()
    .trim()
    .regex(/^([A-Za-z0-9-]{3,100})?$/, { error: 'invalid' }),
  trackingUrl: z.union([z.literal(''), z.url({ protocol: /^https$/, error: 'url' }).max(500)]),
  note: z.string().trim().max(500, { error: 'tooLong' }),
})

function ShipForm({
  locale,
  orderId,
  t,
  simulatedShipping,
  fieldMessages,
  genericError,
  onDone,
  onClose,
}: SubFormProps) {
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, control, setError, formState } = useForm<
    z.input<typeof shipFormSchema>,
    unknown,
    z.output<typeof shipFormSchema>
  >({
    resolver: localizeResolver(zodResolver(shipFormSchema), fieldMessages),
    defaultValues: {
      carrier: simulatedShipping ? '' : 'SMSA',
      carrierName: '',
      trackingNumber: '',
      trackingUrl: '',
      note: '',
    },
  })
  const carrier = useWatch({ control, name: 'carrier' })
  const { errors, isSubmitting } = formState

  async function submit(values: z.output<typeof shipFormSchema>) {
    setFormError(null)
    const carrierName = values.carrier === 'OTHER' ? values.carrierName : values.carrier
    if (!simulatedShipping && !carrierName) {
      setError(values.carrier === 'OTHER' ? 'carrierName' : 'carrier', {
        type: 'required',
        message: fieldMessages.required,
      })
      return
    }
    try {
      await apiRequest(`/api/admin/orders/${orderId}/ship`, {
        body: {
          carrier: carrierName || null,
          trackingNumber: values.trackingNumber || null,
          trackingUrl: values.trackingUrl || null,
          note: values.note || null,
        },
        locale,
      })
      onDone()
    } catch (error) {
      setFormError(
        applyServerErrors(
          error,
          setError,
          ['carrier', 'trackingNumber', 'trackingUrl', 'note'],
          genericError,
        ),
      )
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(submit)(event)}
      noValidate
      className="space-y-4 border border-line bg-ivory/60 p-4"
      data-testid="ship-form"
    >
      {simulatedShipping ? <Alert tone="warning">{t.simulatedShipping}</Alert> : null}
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      {simulatedShipping ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.carrier} error={errors.carrier?.message}>
            {(field) => (
              <Select {...field} {...register('carrier')}>
                {CARRIERS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                <option value="OTHER">{t.carrierOther}</option>
              </Select>
            )}
          </Field>
          {carrier === 'OTHER' ? (
            <Field label={t.carrierName} error={errors.carrierName?.message}>
              {(field) => <Input {...field} {...register('carrierName')} maxLength={64} />}
            </Field>
          ) : null}
          <Field label={t.trackingNumber} error={errors.trackingNumber?.message}>
            {(field) => (
              <Input
                {...field}
                {...register('trackingNumber')}
                dir="ltr"
                maxLength={100}
                autoComplete="off"
              />
            )}
          </Field>
          <Field label={t.trackingUrl} hint={t.trackingUrlHint} error={errors.trackingUrl?.message}>
            {(field) => (
              <Input {...field} {...register('trackingUrl')} type="url" dir="ltr" maxLength={500} />
            )}
          </Field>
        </div>
      )}
      <Field label={t.note} error={errors.note?.message}>
        {(field) => (
          <Textarea {...field} {...register('note')} className="min-h-20" maxLength={500} />
        )}
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={isSubmitting} data-testid="ship-submit">
          {t.shipSubmit}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose} disabled={isSubmitting}>
          {t.close}
        </Button>
      </div>
    </form>
  )
}

const reasonSchema = z.object({
  text: z.string().trim().min(3, { error: 'tooShort' }).max(300, { error: 'tooLong' }),
})

function CancelForm({
  locale,
  orderId,
  t,
  fieldMessages,
  genericError,
  onDone,
  onClose,
}: SubFormProps) {
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<
    z.input<typeof reasonSchema>,
    unknown,
    z.output<typeof reasonSchema>
  >({
    resolver: localizeResolver(zodResolver(reasonSchema), fieldMessages),
    defaultValues: { text: '' },
  })
  async function submit(values: z.output<typeof reasonSchema>) {
    setFormError(null)
    try {
      await apiRequest(`/api/admin/orders/${orderId}/cancel`, {
        body: { reason: values.text },
        locale,
      })
      onDone()
    } catch (error) {
      setFormError(error instanceof ApiClientError ? error.message : genericError)
    }
  }
  return (
    <form
      onSubmit={(event) => void handleSubmit(submit)(event)}
      noValidate
      className="space-y-4 border border-danger/30 bg-danger-soft/40 p-4"
      data-testid="cancel-form"
    >
      <p className="text-sm text-text">{t.cancelHint}</p>
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <Field label={t.cancelReason} error={formState.errors.text?.message}>
        {(field) => (
          <Textarea {...field} {...register('text')} className="min-h-20" maxLength={300} />
        )}
      </Field>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          variant="danger"
          loading={formState.isSubmitting}
          data-testid="cancel-submit"
        >
          {t.cancelSubmit}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onClose}
          disabled={formState.isSubmitting}
        >
          {t.close}
        </Button>
      </div>
    </form>
  )
}

function ResolveForm({
  locale,
  orderId,
  t,
  fieldMessages,
  genericError,
  onDone,
  onClose,
}: SubFormProps) {
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<
    z.input<typeof reasonSchema>,
    unknown,
    z.output<typeof reasonSchema>
  >({
    resolver: localizeResolver(zodResolver(reasonSchema), fieldMessages),
    defaultValues: { text: '' },
  })
  async function submit(values: z.output<typeof reasonSchema>) {
    setFormError(null)
    try {
      await apiRequest(`/api/admin/orders/${orderId}/resolve-attention`, {
        body: { note: values.text },
        locale,
      })
      onDone()
    } catch (error) {
      setFormError(error instanceof ApiClientError ? error.message : genericError)
    }
  }
  return (
    <form
      onSubmit={(event) => void handleSubmit(submit)(event)}
      noValidate
      className="space-y-4 border border-line bg-ivory/60 p-4"
    >
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <Field label={t.resolveNote} error={formState.errors.text?.message}>
        {(field) => (
          <Textarea {...field} {...register('text')} className="min-h-20" maxLength={300} />
        )}
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={formState.isSubmitting}>
          {t.resolveSubmit}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onClose}
          disabled={formState.isSubmitting}
        >
          {t.close}
        </Button>
      </div>
    </form>
  )
}

const refundFormSchema = z.object({
  paymentId: z.string().min(1, { error: 'required' }),
  amount: z.string().trim().min(1, { error: 'required' }),
  reason: z.string().trim().min(3, { error: 'tooShort' }).max(300, { error: 'tooLong' }),
  reference: z.string().trim().max(100, { error: 'tooLong' }),
})

function RefundForm({
  locale,
  orderId,
  t,
  payments,
  paymentMethodNames,
  fieldMessages,
  genericError,
  onDone,
  onClose,
}: Omit<SubFormProps, 'onDone'> & {
  onDone: (status: 'SUCCEEDED' | 'PENDING' | 'FAILED') => void
}) {
  const refundable = payments.filter((payment) => payment.refundable > 0)
  const [formError, setFormError] = useState<string | null>(null)
  const attempt = useRef<{ body: string; key: string } | null>(null)
  const { register, handleSubmit, control, setError, formState } = useForm<
    z.input<typeof refundFormSchema>,
    unknown,
    z.output<typeof refundFormSchema>
  >({
    resolver: localizeResolver(zodResolver(refundFormSchema), fieldMessages),
    defaultValues: { paymentId: refundable[0]?.id ?? '', amount: '', reason: '', reference: '' },
  })
  const paymentId = useWatch({ control, name: 'paymentId' })
  const selected = refundable.find((payment) => payment.id === paymentId)
  const manual = selected?.provider === 'cod'

  async function submit(values: z.output<typeof refundFormSchema>) {
    setFormError(null)
    let amount: number
    try {
      amount = sarToHalalas(values.amount)
    } catch {
      setError('amount', { type: 'validate', message: fieldMessages.amount })
      return
    }
    const payment = refundable.find((entry) => entry.id === values.paymentId)
    if (!payment || amount <= 0 || amount > payment.refundable) {
      setError('amount', { type: 'validate', message: fieldMessages.amount })
      return
    }
    if (payment.provider === 'cod' && !values.reference) {
      setError('reference', { type: 'required', message: fieldMessages.required })
      return
    }
    const body = {
      paymentId: values.paymentId,
      amount,
      reason: values.reason,
      reference: values.reference || null,
    }
    const serialized = JSON.stringify(body)
    // Same request → same key: a double click or retry refunds once.
    if (attempt.current?.body !== serialized)
      attempt.current = { body: serialized, key: crypto.randomUUID() }
    try {
      const result = await apiRequest<{ refund: { status: 'SUCCEEDED' | 'PENDING' | 'FAILED' } }>(
        `/api/admin/orders/${orderId}/refund`,
        { body, locale, headers: { 'Idempotency-Key': attempt.current.key } },
      )
      onDone(result.refund.status)
    } catch (error) {
      setFormError(
        applyServerErrors(
          error,
          setError,
          ['amount', 'reason', 'reference', 'paymentId'],
          genericError,
        ),
      )
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(submit)(event)}
      noValidate
      className="space-y-4 border border-line bg-ivory/60 p-4"
      data-testid="refund-form"
    >
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      {manual ? <p className="text-sm text-text">{t.refundCodHint}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.refundPayment} error={formState.errors.paymentId?.message}>
          {(field) => (
            <Select {...field} {...register('paymentId')}>
              {refundable.map((payment) => (
                <option key={payment.id} value={payment.id}>
                  {paymentMethodNames[payment.method]} · {formatMoney(payment.amount, locale)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label={t.refundAmount}
          hint={
            selected
              ? interpolate(t.refundMax, { amount: formatMoney(selected.refundable, locale) })
              : undefined
          }
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
      </div>
      <Field label={t.refundReason} error={formState.errors.reason?.message}>
        {(field) => <Input {...field} {...register('reason')} maxLength={300} />}
      </Field>
      {manual ? (
        <Field label={t.refundReference} error={formState.errors.reference?.message}>
          {(field) => <Input {...field} {...register('reference')} dir="ltr" maxLength={100} />}
        </Field>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          loading={formState.isSubmitting}
          data-testid="refund-submit"
        >
          {t.refundSubmit}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onClose}
          disabled={formState.isSubmitting}
        >
          {t.close}
        </Button>
      </div>
    </form>
  )
}
