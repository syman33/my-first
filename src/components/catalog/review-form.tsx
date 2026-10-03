'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Star } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import type { z } from 'zod'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { type Dictionary, interpolate } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { ApiClientError, apiRequest } from '@/lib/client/api'
import { applyServerErrors, localizeResolver } from '@/lib/client/forms'
import { reviewSubmissionSchema } from '@/schemas/reviews'
import { cn } from '@/utils/cn'

type FormInput = z.input<typeof reviewSubmissionSchema>
type FormOutput = z.output<typeof reviewSubmissionSchema>

/** Review form for an eligible customer; the star rating is a radio group (keyboard and screen-reader friendly). */
export function ReviewForm({
  locale,
  productId,
  t,
  fieldMessages,
  genericError,
}: {
  locale: Locale
  productId: string
  t: Dictionary['store']['product']
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const { register, handleSubmit, setError, control, formState } = useForm<
    FormInput,
    unknown,
    FormOutput
  >({
    resolver: localizeResolver(zodResolver(reviewSubmissionSchema), fieldMessages),
    defaultValues: { rating: 0, title: '', body: '' },
  })
  const rating = useWatch({ control, name: 'rating' })

  async function submit(values: FormOutput) {
    setFormError(null)
    try {
      const result = await apiRequest<{ review: { status: 'APPROVED' | 'PENDING' } }>(
        `/api/products/${productId}/reviews`,
        {
          body: values,
          locale,
        },
      )
      setDone(result.review.status === 'APPROVED' ? t.reviewThanksApproved : t.reviewThanksPending)
      startTransition(() => router.refresh())
    } catch (error) {
      setFormError(
        error instanceof ApiClientError && error.details.reason === 'ALREADY_REVIEWED'
          ? t.reviewAlready
          : applyServerErrors(error, setError, ['rating', 'title', 'body'], genericError),
      )
    }
  }

  if (done) return <Alert tone="success">{done}</Alert>

  return (
    <form
      onSubmit={(event) => void handleSubmit(submit)(event)}
      noValidate
      className="space-y-5 border border-line bg-paper p-6"
      data-testid="review-form"
    >
      <h3 className="font-display text-2xl text-ink">{t.writeReview}</h3>
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <fieldset>
        <legend className="text-sm font-medium text-ink">{t.reviewRating}</legend>
        <div className="mt-2 flex gap-1" dir="ltr">
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className="cursor-pointer">
              <input
                type="radio"
                value={value}
                className="peer sr-only"
                {...register('rating', { valueAsNumber: true })}
              />
              <span className="sr-only">{interpolate(t.reviewStars, { count: value })}</span>
              <Star
                aria-hidden="true"
                className={cn(
                  'size-7 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink',
                  value <= (Number(rating) || 0)
                    ? 'fill-champagne text-champagne'
                    : 'text-line-strong',
                )}
                strokeWidth={1.25}
              />
            </label>
          ))}
        </div>
        {formState.errors.rating?.message ? (
          <p role="alert" className="mt-2 text-xs text-danger">
            {formState.errors.rating.message}
          </p>
        ) : null}
      </fieldset>
      <Field label={t.reviewTitle} error={formState.errors.title?.message}>
        {(props) => <Input {...props} {...register('title')} maxLength={120} />}
      </Field>
      <Field label={t.reviewBody} hint={t.reviewBodyHint} error={formState.errors.body?.message}>
        {(props) => <Textarea {...props} {...register('body')} maxLength={2000} />}
      </Field>
      <Button type="submit" loading={formState.isSubmitting} data-testid="review-submit">
        {t.reviewSubmit}
      </Button>
    </form>
  )
}
