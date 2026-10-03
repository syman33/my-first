'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { type Path, useForm } from 'react-hook-form'
import { Badge } from '@/components/admin/ui'
import { DeleteButton } from '@/components/admin/delete-button'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field'
import { CategoryKind, Gender } from '@/generated/prisma/enums'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { ApiClientError, apiRequest } from '@/lib/client/api'
import { slugify } from '@/utils/text'
import { fieldErrorsFrom, inputToInt } from './form-helpers'

export interface CategoryRow {
  id: string
  slug: string
  nameAr: string
  nameEn: string
  descriptionAr: string | null
  descriptionEn: string | null
  imageUrl: string | null
  kind: CategoryKind
  gender: Gender | null
  parentId: string | null
  sortOrder: number
  isActive: boolean
  showInNav: boolean
  seoTitleAr: string | null
  seoTitleEn: string | null
  seoDescriptionAr: string | null
  seoDescriptionEn: string | null
  productCount: number
}

interface Values {
  slug: string
  nameAr: string
  nameEn: string
  descriptionAr: string
  descriptionEn: string
  imageUrl: string
  kind: CategoryKind
  gender: string
  parentId: string
  sortOrder: string
  isActive: boolean
  showInNav: boolean
  seoTitleAr: string
  seoTitleEn: string
  seoDescriptionAr: string
  seoDescriptionEn: string
}

const toValues = (row: CategoryRow | null): Values => ({
  slug: row?.slug ?? '',
  nameAr: row?.nameAr ?? '',
  nameEn: row?.nameEn ?? '',
  descriptionAr: row?.descriptionAr ?? '',
  descriptionEn: row?.descriptionEn ?? '',
  imageUrl: row?.imageUrl ?? '',
  kind: row?.kind ?? 'STANDARD',
  gender: row?.gender ?? '',
  parentId: row?.parentId ?? '',
  sortOrder: String(row?.sortOrder ?? 0),
  isActive: row?.isActive ?? true,
  showInNav: row?.showInNav ?? false,
  seoTitleAr: row?.seoTitleAr ?? '',
  seoTitleEn: row?.seoTitleEn ?? '',
  seoDescriptionAr: row?.seoDescriptionAr ?? '',
  seoDescriptionEn: row?.seoDescriptionEn ?? '',
})

interface EditorProps {
  locale: Locale
  categories: CategoryRow[]
  t: Dictionary['admin']['categories']
  genders: Dictionary['admin']['products']['fields']['genders']
  formLabels: Dictionary['admin']['form']
  generateLabel: string
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
}

/** Category tree with an inline create/edit form. */
export function CategoryEditor(props: EditorProps) {
  const { locale, categories, t, formLabels, genericError } = props
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const ar = locale === 'ar'
  const byId = new Map(categories.map((category) => [category.id, category]))
  const depth = (category: CategoryRow) => {
    let level = 0
    let cursor = category.parentId ? byId.get(category.parentId) : undefined
    while (cursor && level < 5) {
      level += 1
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
    }
    return level
  }
  // Parents first, children right after them.
  const ordered: CategoryRow[] = []
  const visit = (parentId: string | null) => {
    for (const category of categories.filter((entry) => entry.parentId === parentId)) {
      ordered.push(category)
      visit(category.id)
    }
  }
  visit(null)

  return (
    <div className="space-y-4">
      {editing === 'new' ? (
        <CategoryForm {...props} category={null} onClose={() => setEditing(null)} />
      ) : (
        <Button size="sm" onClick={() => setEditing('new')} data-testid="category-new">
          {t.new}
        </Button>
      )}
      <ul className="divide-y divide-line border border-line bg-paper">
        {ordered.map((category) => (
          <li key={category.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span
                className="min-w-48 flex-1"
                style={{ paddingInlineStart: `${depth(category) * 1.25}rem` }}
              >
                <span className="font-medium text-ink">
                  {ar ? category.nameAr : category.nameEn}
                </span>
                <span className="ms-2 text-xs text-muted" dir="auto">
                  /{category.slug}
                </span>
              </span>
              <Badge tone="info">{t.kinds[category.kind]}</Badge>
              <Badge tone={category.isActive ? 'success' : 'neutral'}>
                {category.isActive ? t.active : t.inactive}
              </Badge>
              <span className="w-16 text-end text-xs text-muted tabular-nums">
                {category.productCount}
              </span>
              <Button
                size="sm"
                variant="subtle"
                onClick={() => setEditing(editing === category.id ? null : category.id)}
                aria-expanded={editing === category.id}
              >
                {t.edit}
              </Button>
              <DeleteButton
                locale={locale}
                endpoint={`/api/admin/categories/${category.id}`}
                label={t.delete}
                confirmText={t.deleteConfirm}
                yesLabel={formLabels.yes}
                noLabel={formLabels.no}
                reasons={{ NOT_EMPTY: t.notEmpty }}
                genericError={genericError}
              />
            </div>
            {editing === category.id ? (
              <CategoryForm {...props} category={category} onClose={() => setEditing(null)} />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CategoryForm({
  locale,
  categories,
  t,
  genders,
  formLabels,
  generateLabel,
  fieldMessages,
  genericError,
  category,
  onClose,
}: EditorProps & { category: CategoryRow | null; onClose: () => void }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const f = t.fields
  const ar = locale === 'ar'
  const { register, handleSubmit, setError, setValue, getValues, formState } = useForm<Values>({
    defaultValues: toValues(category),
  })
  const err = (name: keyof Values) => formState.errors[name]?.message

  async function submit(values: Values) {
    setFormError(null)
    const sortOrder = inputToInt(values.sortOrder)
    if (sortOrder === undefined || sortOrder === null) {
      setError('sortOrder', { type: 'validate', message: fieldMessages.invalid })
      return
    }
    const body = {
      ...values,
      sortOrder,
      gender: values.gender || null,
      parentId: values.parentId || null,
    }
    try {
      await apiRequest(
        category ? `/api/admin/categories/${category.id}` : '/api/admin/categories',
        {
          method: category ? 'PUT' : 'POST',
          body,
          locale,
        },
      )
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

  const parents = categories.filter(
    (entry) => entry.kind === 'STANDARD' && entry.id !== category?.id,
  )
  return (
    <form
      onSubmit={(event) => void handleSubmit(submit)(event)}
      noValidate
      className="mt-3 space-y-4 border border-line bg-ivory/60 p-4"
      data-testid="category-form"
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
        <Field label={f.kind} error={err('kind')}>
          {(field) => (
            <Select {...field} {...register('kind')}>
              {Object.values(CategoryKind).map((kind) => (
                <option key={kind} value={kind}>
                  {t.kinds[kind]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={f.parent} error={err('parentId')}>
          {(field) => (
            <Select {...field} {...register('parentId')}>
              <option value="">{f.noParent}</option>
              {parents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {ar ? parent.nameAr : parent.nameEn}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={f.gender} error={err('gender')}>
          {(field) => (
            <Select {...field} {...register('gender')}>
              <option value="">{f.anyGender}</option>
              {Object.values(Gender).map((gender) => (
                <option key={gender} value={gender}>
                  {genders[gender]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={f.sortOrder} error={err('sortOrder')}>
          {(field) => <Input {...field} {...register('sortOrder')} inputMode="numeric" dir="ltr" />}
        </Field>
        <Field label={f.imageUrl} error={err('imageUrl')} className="md:col-span-2">
          {(field) => (
            <Input
              {...field}
              {...register('imageUrl')}
              dir="ltr"
              maxLength={500}
              placeholder="/images/categories/…"
            />
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
        <div />
        <Field label={f.seoTitleAr} error={err('seoTitleAr')}>
          {(field) => <Input {...field} {...register('seoTitleAr')} dir="rtl" maxLength={160} />}
        </Field>
        <Field label={f.seoTitleEn} error={err('seoTitleEn')}>
          {(field) => <Input {...field} {...register('seoTitleEn')} dir="ltr" maxLength={160} />}
        </Field>
        <div />
        <Field label={f.seoDescriptionAr} error={err('seoDescriptionAr')}>
          {(field) => (
            <Textarea
              {...field}
              {...register('seoDescriptionAr')}
              className="min-h-20"
              dir="rtl"
              maxLength={320}
            />
          )}
        </Field>
        <Field label={f.seoDescriptionEn} error={err('seoDescriptionEn')}>
          {(field) => (
            <Textarea
              {...field}
              {...register('seoDescriptionEn')}
              className="min-h-20"
              dir="ltr"
              maxLength={320}
            />
          )}
        </Field>
      </div>
      <div className="flex flex-wrap gap-6">
        <Checkbox label={f.isActive} {...register('isActive')} />
        <Checkbox label={f.showInNav} {...register('showInNav')} />
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          loading={formState.isSubmitting}
          data-testid="category-save"
        >
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
