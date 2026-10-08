'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import * as z from 'zod'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Select, Textarea } from '@/components/ui/field'
import { type Dictionary, interpolate } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { ApiClientError, apiRequest } from '@/lib/client/api'
import { localizeResolver } from '@/lib/client/forms'
import { RETURN_REASONS } from '@/lib/orders/returns'
import type { ReturnRequestInput } from '@/schemas/returns'

export interface ReturnableItem {
  orderItemId: string
  name: string
  variantName: string | null
  imageUrl: string | null
  maxQuantity: number
}

const formSchema = z
  .object({
    lines: z.array(
      z.object({
        orderItemId: z.string(),
        selected: z.boolean(),
        quantity: z.number().int().min(1),
      }),
    ),
    reason: z.string().pipe(z.enum(RETURN_REASONS, { error: 'required' })),
    note: z.string().trim().max(1000, { error: 'tooLong' }),
  })
  .refine((values) => values.lines.some((line) => line.selected), {
    path: ['lines'],
    error: 'returnItemsRequired',
  })

type FormInput = z.input<typeof formSchema>
type FormOutput = z.output<typeof formSchema>

/**
 * Return request: pick items and quantities, a reason and an optional note.
 * The server re-checks everything (ownership, window, quantities); the
 * Idempotency-Key makes a double submit create a single request.
 */
export function ReturnRequestForm({
  locale,
  orderId,
  items,
  t,
  fieldMessages,
  genericError,
}: {
  locale: Locale
  orderId: string
  items: ReturnableItem[]
  t: Dictionary['orders']['returns']
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const attempt = useRef<{ body: string; key: string } | null>(null)
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: localizeResolver(zodResolver(formSchema), fieldMessages),
    defaultValues: {
      lines: items.map((item) => ({
        orderItemId: item.orderItemId,
        selected: items.length === 1,
        quantity: 1,
      })),
      reason: '',
      note: '',
    },
  })
  const lines = useWatch({ control, name: 'lines' })

  async function submit(values: FormOutput) {
    setFormError(null)
    const body: ReturnRequestInput = {
      items: values.lines
        .filter((line) => line.selected)
        .map((line) => ({ orderItemId: line.orderItemId, quantity: line.quantity })),
      reason: values.reason,
      note: values.note || null,
    }
    const serialized = JSON.stringify(body)
    // Same request → same key (safe retry); anything changed → new key.
    if (attempt.current?.body !== serialized)
      attempt.current = { body: serialized, key: crypto.randomUUID() }
    try {
      const result = await apiRequest<{ return: { returnNumber: string } }>(
        `/api/orders/${orderId}/returns`,
        { body, locale, headers: { 'Idempotency-Key': attempt.current.key } },
      )
      setSubmitted(interpolate(t.submitted, { number: result.return.returnNumber }))
      setOpen(false)
      reset()
      startTransition(() => router.refresh())
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        const reason = caught.details.reason
        setFormError(
          typeof reason === 'string' && reason in t.errors
            ? t.errors[reason as keyof typeof t.errors]
            : caught.message,
        )
      } else {
        setFormError(genericError)
      }
    }
  }

  if (!open) {
    return (
      <div className="space-y-4">
        {submitted ? <Alert tone="success">{submitted}</Alert> : null}
        <Button
          variant="secondary"
          onClick={() => {
            setSubmitted(null)
            setOpen(true)
          }}
          data-testid="request-return"
        >
          {t.request}
        </Button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(submit)(event)}
      noValidate
      className="space-y-6 border border-line bg-paper p-5"
      data-testid="return-form"
    >
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <fieldset>
        <legend className="text-sm font-medium text-ink">{t.selectItems}</legend>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {items.map((item, index) => (
            <li key={item.orderItemId} className="flex flex-wrap items-center gap-4 py-4">
              <input
                type="checkbox"
                id={`return-line-${item.orderItemId}`}
                className="size-4 shrink-0 accent-ink"
                {...register(`lines.${index}.selected`)}
              />
              <span className="relative block aspect-[4/5] w-12 shrink-0 overflow-hidden bg-sand">
                {item.imageUrl ? (
                  <Image src={item.imageUrl} alt="" fill sizes="48px" className="object-cover" />
                ) : null}
              </span>
              <label
                htmlFor={`return-line-${item.orderItemId}`}
                className="min-w-0 flex-1 cursor-pointer text-sm"
              >
                <span className="sr-only">{interpolate(t.include, { name: item.name })}</span>
                <span aria-hidden="true" className="font-medium text-ink">
                  {item.name}
                </span>
                {item.variantName ? (
                  <span className="block text-xs text-muted">{item.variantName}</span>
                ) : null}
              </label>
              <div className="flex items-center gap-2 text-xs text-muted">
                <span aria-hidden="true">{t.quantity}</span>
                <Select
                  className="h-10 w-20"
                  aria-label={`${t.quantity}: ${item.name}`}
                  disabled={!lines[index]?.selected}
                  {...register(`lines.${index}.quantity`, { valueAsNumber: true })}
                >
                  {Array.from({ length: item.maxQuantity }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </div>
            </li>
          ))}
        </ul>
        {errors.lines?.message ? (
          <p role="alert" className="mt-2 text-xs text-danger">
            {errors.lines.message}
          </p>
        ) : null}
      </fieldset>
      <Field label={t.reason} error={errors.reason?.message}>
        {(props) => (
          <Select {...props} {...register('reason')} data-testid="return-reason">
            <option value="">{t.chooseReason}</option>
            {RETURN_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {t.reasons[reason]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t.note} error={errors.note?.message}>
        {(props) => (
          <Textarea
            {...props}
            {...register('note')}
            maxLength={1000}
            placeholder={t.notePlaceholder}
          />
        )}
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={isSubmitting} data-testid="return-submit">
          {t.submit}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={isSubmitting}
        >
          {t.close}
        </Button>
      </div>
    </form>
  )
}
