'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { type Path, useForm } from 'react-hook-form'
import { fieldErrorsFrom, inputToInt } from '@/components/admin/catalog/form-helpers'
import { DeleteButton } from '@/components/admin/delete-button'
import { Badge } from '@/components/admin/ui'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Textarea } from '@/components/ui/field'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { ApiClientError, apiRequest } from '@/lib/client/api'
import { PAGE_TOKENS } from '@/lib/content/page-tokens'

export interface FaqRow {
  id: string
  questionAr: string
  questionEn: string
  answerAr: string
  answerEn: string
  sortOrder: number
  isPublished: boolean
}

type Values = Omit<FaqRow, 'id' | 'sortOrder'> & { sortOrder: string }

interface EditorProps {
  locale: Locale
  items: FaqRow[]
  t: Dictionary['admin']['faq']
  tokensLabel: string
  emptyLabel: string
  formLabels: Dictionary['admin']['form']
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
}

export function FaqEditor(props: EditorProps) {
  const { locale, items, t, emptyLabel, formLabels, genericError } = props
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const ar = locale === 'ar'
  const nextSortOrder = items.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1
  return (
    <div className="space-y-4">
      {editing === 'new' ? (
        <FaqForm
          {...props}
          item={null}
          defaultSortOrder={Math.min(nextSortOrder, 1000)}
          onClose={() => setEditing(null)}
        />
      ) : (
        <Button size="sm" onClick={() => setEditing('new')} data-testid="faq-new">
          {t.new}
        </Button>
      )}
      {items.length === 0 ? (
        <p className="border border-line bg-paper px-4 py-12 text-center text-sm text-muted">
          {emptyLabel}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="border border-line bg-paper p-4" data-testid="faq-item">
              <div className="flex flex-wrap items-start gap-4">
                <span className="ltr-nums w-8 shrink-0 pt-0.5 text-xs text-muted tabular-nums">
                  {item.sortOrder}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-ink">{ar ? item.questionAr : item.questionEn}</p>
                  <p className="mt-1 line-clamp-2 text-muted">
                    {ar ? item.answerAr : item.answerEn}
                  </p>
                </div>
                <Badge tone={item.isPublished ? 'success' : 'neutral'}>
                  {item.isPublished ? t.published : t.hidden}
                </Badge>
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() => setEditing(editing === item.id ? null : item.id)}
                  aria-expanded={editing === item.id}
                >
                  {t.edit}
                </Button>
                <DeleteButton
                  locale={locale}
                  endpoint={`/api/admin/faq/${item.id}`}
                  label={t.delete}
                  confirmText={t.deleteConfirm}
                  yesLabel={formLabels.yes}
                  noLabel={formLabels.no}
                  genericError={genericError}
                />
              </div>
              {editing === item.id ? (
                <FaqForm
                  {...props}
                  item={item}
                  defaultSortOrder={item.sortOrder}
                  onClose={() => setEditing(null)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FaqForm({
  locale,
  t,
  tokensLabel,
  formLabels,
  fieldMessages,
  genericError,
  item,
  defaultSortOrder,
  onClose,
}: EditorProps & { item: FaqRow | null; defaultSortOrder: number; onClose: () => void }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const f = t.fields
  const { register, handleSubmit, setError, getValues, formState } = useForm<Values>({
    defaultValues: {
      questionAr: item?.questionAr ?? '',
      questionEn: item?.questionEn ?? '',
      answerAr: item?.answerAr ?? '',
      answerEn: item?.answerEn ?? '',
      sortOrder: String(defaultSortOrder),
      isPublished: item?.isPublished ?? true,
    },
  })
  const err = (name: keyof Values) => formState.errors[name]?.message

  async function submit(values: Values) {
    setFormError(null)
    const sortOrder = inputToInt(values.sortOrder)
    if (sortOrder === undefined || sortOrder === null || sortOrder > 1000) {
      setError('sortOrder', { type: 'validate', message: fieldMessages.invalid })
      return
    }
    try {
      await apiRequest(item ? `/api/admin/faq/${item.id}` : '/api/admin/faq', {
        method: item ? 'PUT' : 'POST',
        body: { ...values, sortOrder },
        locale,
      })
      onClose()
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

  return (
    <form
      onSubmit={(event) => void handleSubmit(submit)(event)}
      noValidate
      className="mt-3 space-y-4 border border-line bg-ivory/60 p-4"
      data-testid="faq-form"
    >
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={f.questionAr} error={err('questionAr')}>
          {(field) => (
            <Input
              {...field}
              {...register('questionAr', { required: fieldMessages.required })}
              dir="rtl"
              lang="ar"
              maxLength={300}
            />
          )}
        </Field>
        <Field label={f.questionEn} error={err('questionEn')}>
          {(field) => (
            <Input
              {...field}
              {...register('questionEn', { required: fieldMessages.required })}
              dir="ltr"
              lang="en"
              maxLength={300}
            />
          )}
        </Field>
        <Field label={f.answerAr} error={err('answerAr')}>
          {(field) => (
            <Textarea
              {...field}
              {...register('answerAr', { required: fieldMessages.required })}
              dir="rtl"
              lang="ar"
              maxLength={5000}
            />
          )}
        </Field>
        <Field label={f.answerEn} error={err('answerEn')}>
          {(field) => (
            <Textarea
              {...field}
              {...register('answerEn', { required: fieldMessages.required })}
              dir="ltr"
              lang="en"
              maxLength={5000}
            />
          )}
        </Field>
      </div>
      <p className="text-xs text-muted">
        {tokensLabel}{' '}
        <span dir="ltr" className="font-mono">
          {PAGE_TOKENS.map((token) => `{{${token}}}`).join(' ')}
        </span>
      </p>
      <div className="flex flex-wrap items-end gap-6">
        <Field label={f.sortOrder} error={err('sortOrder')} className="w-32">
          {(field) => <Input {...field} {...register('sortOrder')} inputMode="numeric" dir="ltr" />}
        </Field>
        <Checkbox label={f.isPublished} {...register('isPublished')} className="pb-3" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={formState.isSubmitting} data-testid="faq-save">
          {formLabels.save}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onClose}
          disabled={formState.isSubmitting}
        >
          {formLabels.cancel}
        </Button>
      </div>
    </form>
  )
}
