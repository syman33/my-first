'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type * as z from 'zod'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import { useSessionNavigation } from '@/hooks/use-session-navigation'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { interpolateNodes } from '@/i18n/rich'
import { apiRequest } from '@/lib/client/api'
import { applyServerErrors, localizeResolver } from '@/lib/client/forms'
import { registerSchema, type RegisterInput } from '@/schemas/auth'

interface RegisterFormProps {
  locale: Locale
  t: Dictionary['auth']['register']
  showPassword: string
  hidePassword: string
  optionalLabel: string
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
  next: string
}

export function RegisterForm({
  locale,
  t,
  showPassword,
  hidePassword,
  optionalLabel,
  fieldMessages,
  genericError,
  next,
}: RegisterFormProps) {
  const [formError, setFormError] = useState<string | null>(null)
  const navigate = useSessionNavigation()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput, unknown, z.output<typeof registerSchema>>({
    resolver: localizeResolver(zodResolver(registerSchema), fieldMessages),
    defaultValues: { name: '', email: '', phone: '', password: '', locale, acceptTerms: false },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await apiRequest('/api/auth/register', { body: { ...values, locale }, locale })
      navigate(next)
    } catch (error) {
      setFormError(
        applyServerErrors(
          error,
          setError,
          ['name', 'email', 'phone', 'password', 'acceptTerms'],
          genericError,
        ),
      )
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" data-testid="register-form">
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <Field label={t.name} error={errors.name?.message}>
        {(props) => <Input {...props} {...register('name')} autoComplete="name" />}
      </Field>
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
      <Field
        label={t.phone}
        hint={t.phoneHint}
        optionalLabel={optionalLabel}
        error={errors.phone?.message}
      >
        {(props) => (
          <Input
            {...props}
            {...register('phone')}
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            dir="ltr"
          />
        )}
      </Field>
      <Field label={t.password} hint={t.passwordHint} error={errors.password?.message}>
        {(props) => (
          <PasswordInput
            {...props}
            {...register('password')}
            autoComplete="new-password"
            showLabel={showPassword}
            hideLabel={hidePassword}
          />
        )}
      </Field>
      <Checkbox
        {...register('acceptTerms')}
        error={errors.acceptTerms?.message}
        label={interpolateNodes(t.acceptTerms, {
          terms: (
            <a
              href={`/${locale}/terms`}
              target="_blank"
              rel="noopener"
              className="underline underline-offset-4"
            >
              {t.terms}
            </a>
          ),
          privacy: (
            <a
              href={`/${locale}/privacy`}
              target="_blank"
              rel="noopener"
              className="underline underline-offset-4"
            >
              {t.privacy}
            </a>
          ),
        })}
      />
      <Button type="submit" fullWidth size="lg" loading={isSubmitting} loadingLabel={t.submitting}>
        {t.submit}
      </Button>
    </form>
  )
}
