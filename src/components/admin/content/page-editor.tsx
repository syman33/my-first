'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useState, useTransition } from 'react'
import {
  type Control,
  type FieldErrors,
  type Path,
  type UseFormRegister,
  useForm,
  useWatch,
} from 'react-hook-form'
import { fieldErrorsFrom } from '@/components/admin/catalog/form-helpers'
import { Card } from '@/components/admin/ui'
import { Markdown } from '@/components/content/markdown'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Textarea } from '@/components/ui/field'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { ApiClientError, apiRequest } from '@/lib/client/api'
import { PAGE_TOKENS, type PageToken, renderPageTokens } from '@/lib/content/page-tokens'
import { cn } from '@/utils/cn'

export interface PageEditorValues {
  titleAr: string
  titleEn: string
  contentAr: string
  contentEn: string
  seoTitleAr: string
  seoTitleEn: string
  seoDescriptionAr: string
  seoDescriptionEn: string
  isPublished: boolean
}

type Mode = 'write' | 'preview'

interface Props {
  locale: Locale
  slug: string
  initial: PageEditorValues
  /** Current setting values for the {{tokens}}, per language, so the preview matches the live page. */
  tokenValues: Record<Locale, Record<PageToken, string>>
  t: Dictionary['admin']['pages']
  formLabels: Dictionary['admin']['form']
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
}

const CONTENT_FIELD = { ar: 'contentAr', en: 'contentEn' } as const

export function PageEditor({
  locale,
  slug,
  initial,
  tokenValues,
  t,
  formLabels,
  fieldMessages,
  genericError,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [modes, setModes] = useState<Record<Locale, Mode>>({ ar: 'write', en: 'write' })
  const { register, handleSubmit, setError, getValues, reset, control, formState } =
    useForm<PageEditorValues>({ defaultValues: initial })
  const { errors, isSubmitting, isDirty } = formState
  const f = t.fields
  const err = (name: keyof PageEditorValues) => errors[name]?.message

  // Closing the tab with unsaved text asks first (long policy pages are tedious to retype).
  useEffect(() => {
    if (!isDirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty])

  /** A content field hidden behind its preview cannot show an error or take focus: switch back. */
  function revealContentErrors(names: string[]) {
    setModes((current) => ({
      ar: names.includes(CONTENT_FIELD.ar) ? 'write' : current.ar,
      en: names.includes(CONTENT_FIELD.en) ? 'write' : current.en,
    }))
  }

  async function submit(values: PageEditorValues) {
    setFormError(null)
    setSaved(false)
    try {
      await apiRequest(`/api/admin/pages/${slug}`, { method: 'PUT', body: values, locale })
      reset(values)
      setSaved(true)
      startTransition(() => router.refresh())
    } catch (error) {
      const fields = fieldErrorsFrom(error)
      let unmatched = Object.keys(fields).length === 0
      for (const [key, message] of Object.entries(fields)) {
        if (key in getValues()) setError(key as Path<PageEditorValues>, { type: 'server', message })
        else unmatched = true
      }
      revealContentErrors(Object.keys(fields))
      if (unmatched) setFormError(error instanceof ApiClientError ? error.message : genericError)
    }
  }

  function invalid(found: FieldErrors<PageEditorValues>) {
    revealContentErrors(Object.keys(found))
  }

  const languages = [
    { lang: 'ar' as const, heading: formLabels.arabic, title: 'titleAr' as const },
    { lang: 'en' as const, heading: formLabels.english, title: 'titleEn' as const },
  ]

  return (
    <form
      onSubmit={(event) => void handleSubmit(submit, invalid)(event)}
      noValidate
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]"
      data-testid="page-form"
    >
      <div className="min-w-0 space-y-6">
        {formError ? <Alert tone="error">{formError}</Alert> : null}
        {saved ? <Alert tone="success">{formLabels.saved}</Alert> : null}
        {languages.map(({ lang, heading, title }) => (
          <Card key={lang} title={heading}>
            <div className="space-y-5">
              <Field label={f[title]} error={err(title)}>
                {(props) => (
                  <Input
                    {...props}
                    {...register(title, { required: fieldMessages.required })}
                    dir={lang === 'ar' ? 'rtl' : 'ltr'}
                    lang={lang}
                    maxLength={160}
                  />
                )}
              </Field>
              <ContentField
                lang={lang}
                label={f[CONTENT_FIELD[lang]]}
                control={control}
                register={register}
                requiredMessage={fieldMessages.required}
                error={err(CONTENT_FIELD[lang])}
                mode={modes[lang]}
                onMode={(mode) => setModes((current) => ({ ...current, [lang]: mode }))}
                tokenValues={tokenValues[lang]}
                t={t}
              />
            </div>
          </Card>
        ))}
        <Card title={t.seo}>
          <div className="grid gap-5 md:grid-cols-2">
            <Field
              label={f.seoTitleAr}
              optionalLabel={formLabels.optional}
              error={err('seoTitleAr')}
            >
              {(props) => (
                <Input {...props} {...register('seoTitleAr')} dir="rtl" lang="ar" maxLength={160} />
              )}
            </Field>
            <Field
              label={f.seoTitleEn}
              optionalLabel={formLabels.optional}
              error={err('seoTitleEn')}
            >
              {(props) => (
                <Input {...props} {...register('seoTitleEn')} dir="ltr" lang="en" maxLength={160} />
              )}
            </Field>
            <Field
              label={f.seoDescriptionAr}
              optionalLabel={formLabels.optional}
              error={err('seoDescriptionAr')}
            >
              {(props) => (
                <Textarea
                  {...props}
                  {...register('seoDescriptionAr')}
                  dir="rtl"
                  lang="ar"
                  maxLength={320}
                  className="min-h-24"
                />
              )}
            </Field>
            <Field
              label={f.seoDescriptionEn}
              optionalLabel={formLabels.optional}
              error={err('seoDescriptionEn')}
            >
              {(props) => (
                <Textarea
                  {...props}
                  {...register('seoDescriptionEn')}
                  dir="ltr"
                  lang="en"
                  maxLength={320}
                  className="min-h-24"
                />
              )}
            </Field>
          </div>
        </Card>
      </div>

      <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
        <Card>
          <div className="space-y-4">
            <Checkbox label={f.isPublished} {...register('isPublished')} />
            <p className="text-xs text-muted">{t.hiddenHint}</p>
            <Button type="submit" fullWidth loading={isSubmitting} data-testid="page-save">
              {formLabels.save}
            </Button>
          </div>
        </Card>
        <Card>
          <p className="text-xs leading-6 text-muted">{t.syntax}</p>
          <p className="mt-5 text-xs font-medium text-ink">{t.tokens}</p>
          <dl className="mt-3 space-y-2 text-xs">
            {PAGE_TOKENS.map((token) => (
              <div key={token} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <dt>
                  <code dir="ltr" className="text-ink">{`{{${token}}}`}</code>
                </dt>
                <dd className="text-muted">{tokenValues[locale][token]}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </aside>
    </form>
  )
}

function ContentField({
  lang,
  label,
  control,
  register,
  requiredMessage,
  error,
  mode,
  onMode,
  tokenValues,
  t,
}: {
  lang: Locale
  label: string
  control: Control<PageEditorValues>
  register: UseFormRegister<PageEditorValues>
  requiredMessage: string
  error?: string
  mode: Mode
  onMode: (mode: Mode) => void
  tokenValues: Record<PageToken, string>
  t: Dictionary['admin']['pages']
}) {
  const name = CONTENT_FIELD[lang]
  const source = useWatch({ control, name })
  const id = useId()
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  const toggle = (value: Mode) =>
    cn(
      'px-3 py-1 text-xs transition-colors',
      mode === value ? 'bg-ink text-paper' : 'text-muted hover:text-ink',
    )
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        <div role="group" aria-label={t.mode} className="inline-flex border border-line">
          <button
            type="button"
            aria-pressed={mode === 'write'}
            onClick={() => onMode('write')}
            className={toggle('write')}
          >
            {t.edit_}
          </button>
          <button
            type="button"
            aria-pressed={mode === 'preview'}
            onClick={() => onMode('preview')}
            className={toggle('preview')}
            data-testid={`page-preview-${lang}`}
          >
            {t.preview}
          </button>
        </div>
      </div>
      {/* The textarea stays mounted while previewing so its value and registration survive. */}
      <div className={mode === 'preview' ? 'hidden' : undefined}>
        <Textarea
          id={id}
          {...register(name, { required: requiredMessage })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          dir={dir}
          lang={lang}
          rows={20}
          maxLength={50_000}
          className="font-mono text-sm leading-7"
        />
      </div>
      {mode === 'preview' ? (
        <div
          className="max-h-[40rem] overflow-y-auto border border-line bg-paper px-6 py-5"
          dir={dir}
          lang={lang}
          data-testid={`page-preview-panel-${lang}`}
        >
          <Markdown source={renderPageTokens(source, tokenValues)} />
        </div>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
