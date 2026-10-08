'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type * as z from 'zod'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { apiRequest } from '@/lib/client/api'
import { applyServerErrors, localizeResolver } from '@/lib/client/forms'
import { profileSchema } from '@/schemas/auth'

type ProfileInput = z.input<typeof profileSchema>

interface ProfileFormProps {
  locale: Locale
  t: Dictionary['account']['profile']
  phoneHint: string
  optionalLabel: string
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
  profile: {
    name: string
    email: string
    phone: string | null
    locale: Locale
    emailVerified: boolean
  }
}

export function ProfileForm({
  locale,
  t,
  phoneHint,
  optionalLabel,
  fieldMessages,
  genericError,
  profile,
}: ProfileFormProps) {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileInput, unknown, z.output<typeof profileSchema>>({
    resolver: localizeResolver(zodResolver(profileSchema), fieldMessages),
    defaultValues: { name: profile.name, phone: profile.phone ?? '', locale: profile.locale },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    setSaved(false)
    try {
      const result = await apiRequest<{
        profile: { name: string; phone: string | null; locale: Locale }
      }>('/api/account/profile', {
        method: 'PATCH',
        body: values,
        locale,
      })
      reset({
        name: result.profile.name,
        phone: result.profile.phone ?? '',
        locale: result.profile.locale,
      })
      setSaved(true)
      router.refresh()
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['name', 'phone', 'locale'], genericError))
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-xl space-y-5" data-testid="profile-form">
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      {saved && !isDirty ? <Alert tone="success">{t.saved}</Alert> : null}
      <Field label={t.name} error={errors.name?.message}>
        {(props) => <Input {...props} {...register('name')} autoComplete="name" />}
      </Field>
      <Field
        label={t.email}
        hint={
          <>
            <span className={profile.emailVerified ? 'text-success' : 'text-warning'}>
              {profile.emailVerified ? t.verified : t.unverified}
            </span>
            {' · '}
            {t.emailNote}
          </>
        }
      >
        {(props) => <Input {...props} value={profile.email} readOnly disabled dir="ltr" />}
      </Field>
      <Field
        label={t.phone}
        hint={phoneHint}
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
      <Field label={t.language} error={errors.locale?.message}>
        {(props) => (
          <Select {...props} {...register('locale')}>
            <option value="ar" lang="ar">
              {t.arabic}
            </option>
            <option value="en" lang="en">
              {t.english}
            </option>
          </Select>
        )}
      </Field>
      <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
        {t.save}
      </Button>
    </form>
  )
}
