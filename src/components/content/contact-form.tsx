'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type * as z from 'zod'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { apiRequest } from '@/lib/client/api'
import { applyServerErrors, localizeResolver } from '@/lib/client/forms'
import { contactMessageSchema, type ContactMessageInput } from '@/schemas/engagement'

interface ContactFormProps {
  locale: Locale
  t: Dictionary['store']['contact']
  optionalLabel: string
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
  defaults: { name: string; email: string }
}

export function ContactForm({
  locale,
  t,
  optionalLabel,
  fieldMessages,
  genericError,
  defaults,
}: ContactFormProps) {
  const [formError, setFormError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactMessageInput, unknown, z.output<typeof contactMessageSchema>>({
    resolver: localizeResolver(zodResolver(contactMessageSchema), fieldMessages),
    defaultValues: {
      name: defaults.name,
      email: defaults.email,
      phone: '',
      subject: '',
      message: '',
      locale,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await apiRequest('/api/contact', { body: { ...values, locale }, locale })
      reset({
        name: defaults.name,
        email: defaults.email,
        phone: '',
        subject: '',
        message: '',
        locale,
      })
      setSent(true)
    } catch (error) {
      setSent(false)
      setFormError(
        applyServerErrors(
          error,
          setError,
          ['name', 'email', 'phone', 'subject', 'message'],
          genericError,
        ),
      )
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" data-testid="contact-form">
      {sent ? <Alert tone="success">{t.success}</Alert> : null}
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <div className="grid gap-5 sm:grid-cols-2">
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
      </div>
      <Field label={t.phone} optionalLabel={optionalLabel} error={errors.phone?.message}>
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
      <Field label={t.subject} error={errors.subject?.message}>
        {(props) => <Input {...props} {...register('subject')} maxLength={160} />}
      </Field>
      <Field label={t.message} error={errors.message?.message}>
        {(props) => <Textarea {...props} {...register('message')} rows={6} maxLength={5000} />}
      </Field>
      <Button type="submit" size="lg" loading={isSubmitting} loadingLabel={t.submitting}>
        {t.submit}
      </Button>
    </form>
  )
}
