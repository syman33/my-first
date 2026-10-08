'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type * as z from 'zod'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { apiRequest } from '@/lib/client/api'
import { applyServerErrors, localizeResolver } from '@/lib/client/forms'
import { changePasswordFormSchema } from '@/schemas/auth'

type ChangePasswordValues = z.input<typeof changePasswordFormSchema>

interface ChangePasswordFormProps {
  locale: Locale
  t: Dictionary['account']['security']
  passwordHint: string
  showPassword: string
  hidePassword: string
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
}

export function ChangePasswordForm({
  locale,
  t,
  passwordHint,
  showPassword,
  hidePassword,
  fieldMessages,
  genericError,
}: ChangePasswordFormProps) {
  const [formError, setFormError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: localizeResolver(zodResolver(changePasswordFormSchema), fieldMessages),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  })

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setFormError(null)
    setDone(false)
    try {
      await apiRequest('/api/account/password', { body: { currentPassword, newPassword }, locale })
      reset()
      setDone(true)
    } catch (error) {
      setFormError(
        applyServerErrors(error, setError, ['currentPassword', 'newPassword'], genericError),
      )
    }
  })

  const toggle = { showLabel: showPassword, hideLabel: hidePassword }
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="max-w-xl space-y-5"
      data-testid="change-password-form"
    >
      <p className="text-sm text-muted">{t.note}</p>
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      {done ? <Alert tone="success">{t.success}</Alert> : null}
      <Field label={t.current} error={errors.currentPassword?.message}>
        {(props) => (
          <PasswordInput
            {...props}
            {...register('currentPassword')}
            autoComplete="current-password"
            {...toggle}
          />
        )}
      </Field>
      <Field label={t.next} hint={passwordHint} error={errors.newPassword?.message}>
        {(props) => (
          <PasswordInput
            {...props}
            {...register('newPassword')}
            autoComplete="new-password"
            {...toggle}
          />
        )}
      </Field>
      <Field label={t.confirm} error={errors.confirm?.message}>
        {(props) => (
          <PasswordInput
            {...props}
            {...register('confirm')}
            autoComplete="new-password"
            {...toggle}
          />
        )}
      </Field>
      <Button type="submit" loading={isSubmitting}>
        {t.submit}
      </Button>
    </form>
  )
}
