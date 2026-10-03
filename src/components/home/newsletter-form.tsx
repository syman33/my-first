'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { apiRequest, ApiClientError } from '@/lib/client/api'
import { localizeResolver } from '@/lib/client/forms'
import { newsletterSubscribeSchema } from '@/schemas/engagement'

type NewsletterValues = z.input<typeof newsletterSubscribeSchema>

interface NewsletterFormProps {
  locale: Locale
  t: Dictionary['store']['newsletter']
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
  source: 'home' | 'footer'
  tone?: 'light' | 'dark'
}

export function NewsletterForm({
  locale,
  t,
  fieldMessages,
  genericError,
  source,
  tone = 'light',
}: NewsletterFormProps) {
  const [done, setDone] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewsletterValues>({
    resolver: localizeResolver(zodResolver(newsletterSubscribeSchema), fieldMessages),
    defaultValues: { email: '', locale, source },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await apiRequest('/api/newsletter', { body: { ...values, locale, source }, locale })
      setDone(true)
    } catch (error) {
      setFormError(
        error instanceof ApiClientError ? (error.fieldErrors.email ?? error.message) : genericError,
      )
    }
  })

  const dark = tone === 'dark'
  if (done) {
    return (
      <p role="status" className={dark ? 'text-paper' : 'text-success'}>
        {t.success}
      </p>
    )
  }
  const errorMessage = errors.email?.message ?? formError
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="w-full"
      data-testid={`newsletter-form-${source}`}
    >
      <div className={`flex items-center border-b ${dark ? 'border-paper/60' : 'border-ink'}`}>
        <label htmlFor={`newsletter-${source}`} className="sr-only">
          {t.email}
        </label>
        <input
          id={`newsletter-${source}`}
          type="email"
          autoComplete="email"
          inputMode="email"
          dir="ltr"
          placeholder={t.email}
          aria-invalid={errorMessage ? true : undefined}
          aria-describedby={errorMessage ? `newsletter-${source}-error` : undefined}
          className={`h-12 flex-1 bg-transparent text-sm focus:outline-none ${dark ? 'text-paper placeholder:text-paper/60' : 'text-ink placeholder:text-muted-decorative'}`}
          {...register('email')}
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className={`h-12 shrink-0 px-2 text-sm font-medium tracking-wide disabled:opacity-60 ${dark ? 'text-paper' : 'text-ink'}`}
        >
          {isSubmitting ? t.submitting : t.submit}
        </button>
      </div>
      {errorMessage ? (
        <p
          id={`newsletter-${source}-error`}
          role="alert"
          className={`mt-2 text-xs ${dark ? 'text-paper' : 'text-danger'}`}
        >
          {errorMessage}
        </p>
      ) : null}
    </form>
  )
}
