'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { type Path, useForm, useWatch } from 'react-hook-form'
import { fieldErrorsFrom } from '@/components/admin/catalog/form-helpers'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { ApiClientError, apiRequest } from '@/lib/client/api'

interface Values {
  name: string
  email: string
  role: 'STAFF' | 'ADMIN'
  locale: Locale
}

export function InviteStaffForm({
  locale,
  t,
  formLabels,
  fieldMessages,
  genericError,
}: {
  locale: Locale
  t: Dictionary['admin']['staff']
  formLabels: Dictionary['admin']['form']
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const blank: Values = { name: '', email: '', role: 'STAFF', locale }
  const { register, handleSubmit, setError, getValues, reset, control, formState } =
    useForm<Values>({ defaultValues: blank })
  const role = useWatch({ control, name: 'role' })
  const err = (name: keyof Values) => formState.errors[name]?.message

  async function submit(values: Values) {
    setFormError(null)
    setSent(false)
    try {
      await apiRequest('/api/admin/staff', { body: values, locale })
      reset({ ...blank, locale: values.locale })
      setSent(true)
      setOpen(false)
      startTransition(() => router.refresh())
    } catch (error) {
      const fields = fieldErrorsFrom(error)
      let unmatched = Object.keys(fields).length === 0
      for (const [key, message] of Object.entries(fields)) {
        if (key in getValues()) setError(key as Path<Values>, { type: 'server', message })
        else unmatched = true
      }
      if (unmatched) setFormError(error instanceof ApiClientError ? error.message : genericError)
    }
  }

  if (!open) {
    return (
      <div className="space-y-3">
        {sent ? <Alert tone="success">{t.invited}</Alert> : null}
        <Button
          size="sm"
          onClick={() => {
            setSent(false)
            setOpen(true)
          }}
          data-testid="staff-invite"
        >
          {t.invite}
        </Button>
      </div>
    )
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(submit)(event)}
      noValidate
      className="space-y-4 border border-line bg-ivory/60 p-4"
      data-testid="staff-invite-form"
    >
      <div>
        <h2 className="text-sm font-medium text-ink">{t.inviteTitle}</h2>
        <p className="mt-1 text-xs text-muted">{t.inviteHint}</p>
      </div>
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t.fields.name} error={err('name')}>
          {(field) => (
            <Input
              {...field}
              {...register('name', { required: fieldMessages.required })}
              autoComplete="off"
              maxLength={120}
            />
          )}
        </Field>
        <Field label={t.fields.email} error={err('email')}>
          {(field) => (
            <Input
              {...field}
              {...register('email', { required: fieldMessages.required })}
              type="email"
              dir="ltr"
              autoComplete="off"
              maxLength={254}
            />
          )}
        </Field>
        <Field label={t.fields.role} hint={t.roleHints[role]} error={err('role')}>
          {(field) => (
            <Select {...field} {...register('role')}>
              <option value="STAFF">{t.roles.STAFF}</option>
              <option value="ADMIN">{t.roles.ADMIN}</option>
            </Select>
          )}
        </Field>
        <Field label={t.fields.locale} error={err('locale')}>
          {(field) => (
            <Select {...field} {...register('locale')}>
              <option value="ar">{t.languages.ar}</option>
              <option value="en">{t.languages.en}</option>
            </Select>
          )}
        </Field>
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          loading={formState.isSubmitting}
          data-testid="staff-invite-send"
        >
          {t.invite}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={formState.isSubmitting}
        >
          {formLabels.cancel}
        </Button>
      </div>
    </form>
  )
}
