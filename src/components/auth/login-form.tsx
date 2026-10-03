'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import { useSessionNavigation } from '@/hooks/use-session-navigation'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { apiRequest } from '@/lib/client/api'
import { applyServerErrors, localizeResolver } from '@/lib/client/forms'
import { loginSchema, type LoginInput } from '@/schemas/auth'

interface LoginFormProps {
  locale: Locale
  t: Dictionary['auth']['login']
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
  /** Validated, same-site destination after signing in. */
  next: string
}

export function LoginForm({ locale, t, fieldMessages, genericError, next }: LoginFormProps) {
  const [formError, setFormError] = useState<string | null>(null)
  const navigate = useSessionNavigation()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: localizeResolver(zodResolver(loginSchema), fieldMessages),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await apiRequest('/api/auth/login', { body: values, locale })
      navigate(next)
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['email', 'password'], genericError))
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" data-testid="login-form">
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
      <Field label={t.password} error={errors.password?.message}>
        {(props) => (
          <PasswordInput
            {...props}
            {...register('password')}
            autoComplete="current-password"
            showLabel={t.showPassword}
            hideLabel={t.hidePassword}
          />
        )}
      </Field>
      <div className="flex justify-end">
        <Link
          href={`/${locale}/forgot-password`}
          className="text-sm text-champagne-strong underline-offset-4 hover:underline"
        >
          {t.forgot}
        </Link>
      </div>
      <Button type="submit" fullWidth size="lg" loading={isSubmitting} loadingLabel={t.submitting}>
        {t.submit}
      </Button>
    </form>
  )
}
