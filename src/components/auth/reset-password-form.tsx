'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'
import { Alert } from '@/components/ui/alert'
import { Button, ButtonLink } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import { Spinner } from '@/components/ui/spinner'
import { useFragmentParam } from '@/hooks/use-fragment-param'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { apiRequest } from '@/lib/client/api'
import { applyServerErrors, localizeResolver } from '@/lib/client/forms'
import { newPasswordFormSchema } from '@/schemas/auth'

type NewPasswordValues = z.input<typeof newPasswordFormSchema>

interface ResetPasswordFormProps {
  locale: Locale
  t: Dictionary['auth']['reset']
  signInLabel: string
  showPassword: string
  hidePassword: string
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
}

export function ResetPasswordForm({
  locale,
  t,
  signInLabel,
  showPassword,
  hidePassword,
  fieldMessages,
  genericError,
}: ResetPasswordFormProps) {
  const token = useFragmentParam('token')
  const [formError, setFormError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordValues>({
    resolver: localizeResolver(zodResolver(newPasswordFormSchema), fieldMessages),
    defaultValues: { password: '', confirm: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    if (!token) return
    setFormError(null)
    try {
      await apiRequest('/api/auth/reset-password', {
        body: { token, password: values.password },
        locale,
      })
      setDone(true)
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['password'], genericError))
    }
  })

  if (token === undefined) return <Spinner className="size-5 text-muted" />

  if (!token) {
    return (
      <div className="space-y-6">
        <Alert tone="warning">{t.missingToken}</Alert>
        <ButtonLink href={`/${locale}/forgot-password`} variant="secondary">
          {t.requestNew}
        </ButtonLink>
      </div>
    )
  }

  if (done) {
    return (
      <div className="space-y-6">
        <Alert tone="success" title={t.successTitle}>
          {t.success}
        </Alert>
        <ButtonLink href={`/${locale}/login`}>{signInLabel}</ButtonLink>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" data-testid="reset-password-form">
      {formError ? (
        <Alert tone="error">
          {formError}{' '}
          <Link href={`/${locale}/forgot-password`} className="underline underline-offset-4">
            {t.requestNew}
          </Link>
        </Alert>
      ) : null}
      <Field label={t.password} error={errors.password?.message}>
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
      <Field label={t.confirm} error={errors.confirm?.message}>
        {(props) => (
          <PasswordInput
            {...props}
            {...register('confirm')}
            autoComplete="new-password"
            showLabel={showPassword}
            hideLabel={hidePassword}
          />
        )}
      </Field>
      <Button type="submit" fullWidth size="lg" loading={isSubmitting} loadingLabel={t.submitting}>
        {t.submit}
      </Button>
    </form>
  )
}
