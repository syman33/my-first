'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { apiRequest } from '@/lib/client/api'
import { applyServerErrors, localizeResolver } from '@/lib/client/forms'
import { forgotPasswordSchema } from '@/schemas/auth'
import type { z } from 'zod'

type ForgotPasswordValues = z.input<typeof forgotPasswordSchema>

interface ForgotPasswordFormProps {
  locale: Locale
  t: Dictionary['auth']['forgot']
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
}

export function ForgotPasswordForm({
  locale,
  t,
  fieldMessages,
  genericError,
}: ForgotPasswordFormProps) {
  const [formError, setFormError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: localizeResolver(zodResolver(forgotPasswordSchema), fieldMessages),
    defaultValues: { email: '', locale },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await apiRequest('/api/auth/forgot-password', { body: { ...values, locale }, locale })
      setSent(true)
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['email'], genericError))
    }
  })

  if (sent) {
    return (
      <Alert tone="success" title={t.sentTitle}>
        {t.sent}
      </Alert>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" data-testid="forgot-password-form">
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <Field label={t.email} error={errors.email?.message}>
        {(props) => (
          <Input
            {...props}
            {...register('email')}
            type="email"
            autoComplete="email"
            inputMode="email"
            dir="ltr"
          />
        )}
      </Field>
      <Button type="submit" fullWidth size="lg" loading={isSubmitting} loadingLabel={t.submitting}>
        {t.submit}
      </Button>
    </form>
  )
}
