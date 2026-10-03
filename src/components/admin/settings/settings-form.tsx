'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { fieldErrorsFrom } from '@/components/admin/catalog/form-helpers'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Textarea } from '@/components/ui/field'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import {
  formValuesToSettings,
  SETTINGS_FIELDS,
  type SettingsField,
  settingsFieldName,
  type SettingsFormValues,
} from '@/lib/admin/settings-fields'
import { ApiClientError, apiRequest } from '@/lib/client/api'
import type { SettingsGroup } from '@/schemas/settings'
import { cn } from '@/utils/cn'

interface Props {
  locale: Locale
  group: SettingsGroup
  initial: SettingsFormValues
  /** Keyed by form field name (see settingsFieldName). */
  labels: Record<string, string>
  hints: Record<string, string>
  /** Labels for the choices of "options" fields (order statuses, payment methods). */
  optionLabels: Record<string, string>
  savedLabel: string
  formLabels: Dictionary['admin']['form']
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
}

const INPUT_TYPES: Partial<
  Record<
    SettingsField['kind'],
    { type?: string; inputMode?: 'decimal' | 'numeric' | 'tel' | 'email' | 'url' }
  >
> = {
  email: { type: 'email', inputMode: 'email' },
  url: { type: 'url', inputMode: 'url' },
  phone: { type: 'tel', inputMode: 'tel' },
  money: { inputMode: 'decimal' },
  optionalMoney: { inputMode: 'decimal' },
  percent: { inputMode: 'decimal' },
  int: { inputMode: 'numeric' },
}

export function SettingsForm({
  locale,
  group,
  initial,
  labels,
  hints,
  optionLabels,
  savedLabel,
  formLabels,
  fieldMessages,
  genericError,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const { register, handleSubmit, setError, getValues, reset, formState } =
    useForm<SettingsFormValues>({ defaultValues: initial })
  const errorOf = (name: string) => {
    const message = formState.errors[name]?.message
    return typeof message === 'string' ? message : undefined
  }

  async function submit(values: SettingsFormValues) {
    setFormError(null)
    setSaved(false)
    const { document, errors } = formValuesToSettings(group, values)
    const invalid = Object.entries(errors)
    if (invalid.length > 0) {
      invalid.forEach(([name, key], index) =>
        setError(
          name,
          { type: 'validate', message: fieldMessages[key] },
          { shouldFocus: index === 0 },
        ),
      )
      return
    }
    try {
      await apiRequest(`/api/admin/settings/${group}`, { method: 'PUT', body: document, locale })
      reset(values)
      setSaved(true)
      startTransition(() => router.refresh())
    } catch (error) {
      const fields = fieldErrorsFrom(error)
      let unmatched = Object.keys(fields).length === 0
      for (const [path, message] of Object.entries(fields)) {
        const name = settingsFieldName(path)
        if (name in getValues()) setError(name, { type: 'server', message })
        else unmatched = true
      }
      if (unmatched) setFormError(error instanceof ApiClientError ? error.message : genericError)
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(submit)(event)}
      noValidate
      className="space-y-6"
      data-testid={`settings-form-${group}`}
    >
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      {saved ? <Alert tone="success">{savedLabel}</Alert> : null}
      <div className="grid gap-5 md:grid-cols-2">
        {SETTINGS_FIELDS[group].map((field) => {
          const name = settingsFieldName(field.path)
          const label = labels[name] ?? field.path
          const hint = hints[name]
          const error = errorOf(name)
          // Server-rendered markup shows the stored values before hydration (react-hook-form fills fields on mount).
          const initialValue = initial[name]
          const initialText = typeof initialValue === 'string' ? initialValue : undefined
          if (field.kind === 'boolean') {
            return (
              <div key={name} className="md:col-span-2">
                <Checkbox
                  label={label}
                  error={error}
                  defaultChecked={initialValue === true}
                  {...register(name)}
                />
                {hint ? <p className="mt-1 ps-7 text-xs text-muted">{hint}</p> : null}
              </div>
            )
          }
          if (field.kind === 'options') {
            return (
              <fieldset key={name} className="md:col-span-2">
                <legend className="text-sm font-medium text-ink">{label}</legend>
                <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
                  {(field.options ?? []).map((option) => (
                    <Checkbox
                      key={option}
                      label={optionLabels[option] ?? option}
                      value={option}
                      defaultChecked={Array.isArray(initialValue) && initialValue.includes(option)}
                      {...register(name)}
                    />
                  ))}
                </div>
                {hint && !error ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
                {error ? (
                  <p role="alert" className="mt-2 text-xs text-danger">
                    {error}
                  </p>
                ) : null}
              </fieldset>
            )
          }
          if (field.kind === 'textarea') {
            return (
              <Field
                key={name}
                label={label}
                hint={hint}
                error={error}
                className={cn(field.rowStart && 'md:col-start-1')}
              >
                {(props) => (
                  <Textarea
                    {...props}
                    defaultValue={initialText}
                    {...register(name)}
                    dir={field.dir}
                    maxLength={field.maxLength}
                    className="min-h-24"
                  />
                )}
              </Field>
            )
          }
          const input = INPUT_TYPES[field.kind] ?? {}
          return (
            <Field
              key={name}
              label={label}
              hint={hint}
              error={error}
              className={cn(field.rowStart && 'md:col-start-1')}
            >
              {(props) => (
                <Input
                  {...props}
                  defaultValue={initialText}
                  {...register(name)}
                  type={input.type ?? 'text'}
                  inputMode={input.inputMode}
                  dir={field.dir ?? 'ltr'}
                  maxLength={field.maxLength}
                />
              )}
            </Field>
          )
        })}
      </div>
      <Button type="submit" loading={formState.isSubmitting} data-testid="settings-save">
        {formLabels.save}
      </Button>
    </form>
  )
}
