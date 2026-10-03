'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { type Path, useForm } from 'react-hook-form'
import { Badge } from '@/components/admin/ui'
import { DeleteButton } from '@/components/admin/delete-button'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Textarea } from '@/components/ui/field'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { ApiClientError, apiRequest } from '@/lib/client/api'
import { slugify } from '@/utils/text'
import { fieldErrorsFrom } from './form-helpers'

export interface BrandRow {
  id: string
  slug: string
  nameAr: string
  nameEn: string
  descriptionAr: string | null
  descriptionEn: string | null
  logoUrl: string | null
  isActive: boolean
  productCount: number
}

interface Values {
  slug: string
  nameAr: string
  nameEn: string
  descriptionAr: string
  descriptionEn: string
  logoUrl: string
  isActive: boolean
}

interface EditorProps {
  locale: Locale
  brands: BrandRow[]
  t: Dictionary['admin']['brands']
  activeLabels: { active: string; inactive: string }
  generateLabel: string
  formLabels: Dictionary['admin']['form']
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
}

export function BrandEditor(props: EditorProps) {
  const { locale, brands, t, activeLabels, formLabels, genericError } = props
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const ar = locale === 'ar'
  return (
    <div className="space-y-4">
      {editing === 'new' ? (
        <BrandForm {...props} brand={null} onClose={() => setEditing(null)} />
      ) : (
        <Button size="sm" onClick={() => setEditing('new')} data-testid="brand-new">
          {t.new}
        </Button>
      )}
      <ul className="divide-y divide-line border border-line bg-paper">
        {brands.map((brand) => (
          <li key={brand.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="min-w-48 flex-1">
                <span className="font-medium text-ink">{ar ? brand.nameAr : brand.nameEn}</span>
                <span className="ms-2 text-xs text-muted" dir="auto">
                  /{brand.slug}
                </span>
              </span>
              <Badge tone={brand.isActive ? 'success' : 'neutral'}>
                {brand.isActive ? activeLabels.active : activeLabels.inactive}
              </Badge>
              <span className="w-16 text-end text-xs text-muted tabular-nums">
                {brand.productCount}
              </span>
              <Button
                size="sm"
                variant="subtle"
                onClick={() => setEditing(editing === brand.id ? null : brand.id)}
                aria-expanded={editing === brand.id}
              >
                {t.edit}
              </Button>
              <DeleteButton
                locale={locale}
                endpoint={`/api/admin/brands/${brand.id}`}
                label={t.delete}
                confirmText={t.deleteConfirm}
                yesLabel={formLabels.yes}
                noLabel={formLabels.no}
                reasons={{ NOT_EMPTY: t.notEmpty }}
                genericError={genericError}
              />
            </div>
            {editing === brand.id ? (
              <BrandForm {...props} brand={brand} onClose={() => setEditing(null)} />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function BrandForm({
  locale,
  t,
  generateLabel,
  formLabels,
  fieldMessages,
  genericError,
  brand,
  onClose,
}: EditorProps & { brand: BrandRow | null; onClose: () => void }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const f = t.fields
  const { register, handleSubmit, setError, setValue, getValues, formState } = useForm<Values>({
    defaultValues: {
      slug: brand?.slug ?? '',
      nameAr: brand?.nameAr ?? '',
      nameEn: brand?.nameEn ?? '',
      descriptionAr: brand?.descriptionAr ?? '',
      descriptionEn: brand?.descriptionEn ?? '',
      logoUrl: brand?.logoUrl ?? '',
      isActive: brand?.isActive ?? true,
    },
  })
  const err = (name: keyof Values) => formState.errors[name]?.message

  async function submit(values: Values) {
    setFormError(null)
    try {
      await apiRequest(brand ? `/api/admin/brands/${brand.id}` : '/api/admin/brands', {
        method: brand ? 'PUT' : 'POST',
        body: values,
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
      data-testid="brand-form"
    >
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={f.nameAr} error={err('nameAr')}>
          {(field) => (
            <Input
              {...field}
              {...register('nameAr', { required: fieldMessages.required })}
              dir="rtl"
              maxLength={120}
            />
          )}
        </Field>
        <Field label={f.nameEn} error={err('nameEn')}>
          {(field) => (
            <Input
              {...field}
              {...register('nameEn', { required: fieldMessages.required })}
              dir="ltr"
              maxLength={120}
            />
          )}
        </Field>
        <Field label={f.slug} error={err('slug')}>
          {(field) => (
            <div className="flex gap-2">
              <Input
                {...field}
                {...register('slug', { required: fieldMessages.required })}
                dir="ltr"
                maxLength={120}
              />
              <Button
                type="button"
                size="sm"
                variant="subtle"
                className="h-12 shrink-0"
                onClick={() => setValue('slug', slugify(getValues('nameEn')))}
              >
                {generateLabel}
              </Button>
            </div>
          )}
        </Field>
        <Field label={f.descriptionAr} error={err('descriptionAr')}>
          {(field) => (
            <Textarea
              {...field}
              {...register('descriptionAr')}
              className="min-h-20"
              dir="rtl"
              maxLength={2000}
            />
          )}
        </Field>
        <Field label={f.descriptionEn} error={err('descriptionEn')}>
          {(field) => (
            <Textarea
              {...field}
              {...register('descriptionEn')}
              className="min-h-20"
              dir="ltr"
              maxLength={2000}
            />
          )}
        </Field>
        <Field label={f.logoUrl} error={err('logoUrl')}>
          {(field) => <Input {...field} {...register('logoUrl')} dir="ltr" maxLength={500} />}
        </Field>
      </div>
      <Checkbox label={f.isActive} {...register('isActive')} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={formState.isSubmitting} data-testid="brand-save">
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
