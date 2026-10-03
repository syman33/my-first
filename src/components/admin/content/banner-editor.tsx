'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { type Path, useForm, useWatch } from 'react-hook-form'
import { Upload } from 'lucide-react'
import { fieldErrorsFrom, inputToInt } from '@/components/admin/catalog/form-helpers'
import { DeleteButton } from '@/components/admin/delete-button'
import { Badge } from '@/components/admin/ui'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Select } from '@/components/ui/field'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { ApiClientError, apiRequest, apiUpload } from '@/lib/client/api'

export interface BannerRow {
  id: string
  placement: 'HERO' | 'PROMO'
  titleAr: string
  titleEn: string
  subtitleAr: string | null
  subtitleEn: string | null
  ctaLabelAr: string | null
  ctaLabelEn: string | null
  linkUrl: string | null
  imageUrl: string
  imageKey: string | null
  mobileImageUrl: string | null
  altAr: string | null
  altEn: string | null
  startsAt: string
  endsAt: string
  isActive: boolean
  sortOrder: number
  state: 'live' | 'scheduled' | 'ended' | 'off'
}

type Values = Omit<
  BannerRow,
  | 'id'
  | 'state'
  | 'sortOrder'
  | 'subtitleAr'
  | 'subtitleEn'
  | 'ctaLabelAr'
  | 'ctaLabelEn'
  | 'linkUrl'
  | 'imageKey'
  | 'mobileImageUrl'
  | 'altAr'
  | 'altEn'
> & {
  subtitleAr: string
  subtitleEn: string
  ctaLabelAr: string
  ctaLabelEn: string
  linkUrl: string
  imageKey: string
  mobileImageUrl: string
  altAr: string
  altEn: string
  sortOrder: string
}

interface EditorProps {
  locale: Locale
  banners: BannerRow[]
  t: Dictionary['admin']['banners']
  uploadErrors: Dictionary['admin']['products']['images']['rejected']
  formLabels: Dictionary['admin']['form']
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
}

const STATE_TONE = {
  live: 'success',
  scheduled: 'accent',
  ended: 'neutral',
  off: 'neutral',
} as const

export function BannerEditor(props: EditorProps) {
  const { locale, banners, t, formLabels, genericError } = props
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const ar = locale === 'ar'
  return (
    <div className="space-y-4">
      {editing === 'new' ? (
        <BannerForm {...props} banner={null} onClose={() => setEditing(null)} />
      ) : (
        <Button size="sm" onClick={() => setEditing('new')} data-testid="banner-new">
          {t.new}
        </Button>
      )}
      <ul className="space-y-3">
        {banners.map((banner) => (
          <li key={banner.id} className="border border-line bg-paper p-3">
            <div className="flex flex-wrap items-center gap-4">
              <span className="relative block h-16 w-28 shrink-0 overflow-hidden bg-sand">
                <Image src={banner.imageUrl} alt="" fill sizes="112px" className="object-cover" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-ink">{ar ? banner.titleAr : banner.titleEn}</p>
                <p className="text-xs text-muted">{t.placements[banner.placement]}</p>
              </div>
              <Badge tone={STATE_TONE[banner.state]}>{t[banner.state]}</Badge>
              <Button
                size="sm"
                variant="subtle"
                onClick={() => setEditing(editing === banner.id ? null : banner.id)}
                aria-expanded={editing === banner.id}
              >
                {t.edit}
              </Button>
              <DeleteButton
                locale={locale}
                endpoint={`/api/admin/banners/${banner.id}`}
                label={t.delete}
                confirmText={t.deleteConfirm}
                yesLabel={formLabels.yes}
                noLabel={formLabels.no}
                genericError={genericError}
              />
            </div>
            {editing === banner.id ? (
              <BannerForm {...props} banner={banner} onClose={() => setEditing(null)} />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ImageField({
  locale,
  label,
  value,
  onUploaded,
  t,
  uploadErrors,
  genericError,
  error,
}: {
  locale: Locale
  label: string
  value: string
  onUploaded: (image: { url: string; key: string }) => void
  t: Dictionary['admin']['banners']
  uploadErrors: EditorProps['uploadErrors']
  genericError: string
  error?: string
}) {
  const [busy, setBusy] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  async function upload(file: File) {
    setBusy(true)
    setUploadError(null)
    try {
      const form = new FormData()
      form.set('file', file)
      const result = await apiUpload<{ image: { url: string; key: string } }>(
        '/api/admin/banners/upload',
        form,
        { locale },
      )
      onUploaded(result.image)
    } catch (caught) {
      const reason = caught instanceof ApiClientError ? caught.details.reason : undefined
      setUploadError(
        typeof reason === 'string' && reason in uploadErrors
          ? uploadErrors[reason as keyof typeof uploadErrors]
          : caught instanceof ApiClientError
            ? caught.message
            : genericError,
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-ink">{label}</p>
      {value ? (
        <span className="relative block h-28 w-full max-w-xs overflow-hidden bg-sand">
          <Image src={value} alt="" fill sizes="320px" className="object-cover" />
        </span>
      ) : null}
      <label className="inline-flex cursor-pointer items-center gap-2 border border-ink px-3 py-1.5 text-xs text-ink hover:bg-ink hover:text-paper">
        <Upload className="size-4" aria-hidden="true" />
        {busy ? t.fields.uploading : t.fields.upload}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void upload(file)
          }}
        />
      </label>
      {(uploadError ?? error) ? (
        <p role="alert" className="text-xs text-danger">
          {uploadError ?? error}
        </p>
      ) : null}
    </div>
  )
}

function BannerForm({
  locale,
  t,
  uploadErrors,
  formLabels,
  fieldMessages,
  genericError,
  banner,
  onClose,
}: EditorProps & { banner: BannerRow | null; onClose: () => void }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const f = t.fields
  const { register, handleSubmit, setError, setValue, getValues, control, formState } =
    useForm<Values>({
      defaultValues: {
        placement: banner?.placement ?? 'HERO',
        titleAr: banner?.titleAr ?? '',
        titleEn: banner?.titleEn ?? '',
        subtitleAr: banner?.subtitleAr ?? '',
        subtitleEn: banner?.subtitleEn ?? '',
        ctaLabelAr: banner?.ctaLabelAr ?? '',
        ctaLabelEn: banner?.ctaLabelEn ?? '',
        linkUrl: banner?.linkUrl ?? '',
        imageUrl: banner?.imageUrl ?? '',
        imageKey: banner?.imageKey ?? '',
        mobileImageUrl: banner?.mobileImageUrl ?? '',
        altAr: banner?.altAr ?? '',
        altEn: banner?.altEn ?? '',
        startsAt: banner?.startsAt ?? '',
        endsAt: banner?.endsAt ?? '',
        isActive: banner?.isActive ?? true,
        sortOrder: String(banner?.sortOrder ?? 0),
      },
    })
  const imageUrl = useWatch({ control, name: 'imageUrl' })
  const mobileImageUrl = useWatch({ control, name: 'mobileImageUrl' })
  const err = (name: keyof Values) => formState.errors[name]?.message

  async function submit(values: Values) {
    setFormError(null)
    const sortOrder = inputToInt(values.sortOrder)
    if (sortOrder === undefined || sortOrder === null) {
      setError('sortOrder', { type: 'validate', message: fieldMessages.invalid })
      return
    }
    if (!values.imageUrl) {
      setError('imageUrl', { type: 'required', message: fieldMessages.required })
      return
    }
    try {
      await apiRequest(banner ? `/api/admin/banners/${banner.id}` : '/api/admin/banners', {
        method: banner ? 'PUT' : 'POST',
        body: {
          ...values,
          sortOrder,
          startsAt: values.startsAt || null,
          endsAt: values.endsAt || null,
        },
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
      data-testid="banner-form"
    >
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <ImageField
          locale={locale}
          label={f.image}
          value={imageUrl}
          t={t}
          uploadErrors={uploadErrors}
          genericError={genericError}
          error={err('imageUrl')}
          onUploaded={(image) => {
            setValue('imageUrl', image.url, { shouldDirty: true })
            setValue('imageKey', image.key)
          }}
        />
        <ImageField
          locale={locale}
          label={f.mobileImage}
          value={mobileImageUrl}
          t={t}
          uploadErrors={uploadErrors}
          genericError={genericError}
          error={err('mobileImageUrl')}
          onUploaded={(image) => setValue('mobileImageUrl', image.url, { shouldDirty: true })}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={f.placement}>
          {(field) => (
            <Select {...field} {...register('placement')}>
              <option value="HERO">{t.placements.HERO}</option>
              <option value="PROMO">{t.placements.PROMO}</option>
            </Select>
          )}
        </Field>
        <Field label={f.titleAr} error={err('titleAr')}>
          {(field) => (
            <Input
              {...field}
              {...register('titleAr', { required: fieldMessages.required })}
              dir="rtl"
              maxLength={160}
            />
          )}
        </Field>
        <Field label={f.titleEn} error={err('titleEn')}>
          {(field) => (
            <Input
              {...field}
              {...register('titleEn', { required: fieldMessages.required })}
              dir="ltr"
              maxLength={160}
            />
          )}
        </Field>
        <Field label={f.linkUrl} hint={f.linkHint} error={err('linkUrl')}>
          {(field) => <Input {...field} {...register('linkUrl')} dir="ltr" maxLength={500} />}
        </Field>
        <Field label={f.subtitleAr} error={err('subtitleAr')}>
          {(field) => <Input {...field} {...register('subtitleAr')} dir="rtl" maxLength={400} />}
        </Field>
        <Field label={f.subtitleEn} error={err('subtitleEn')}>
          {(field) => <Input {...field} {...register('subtitleEn')} dir="ltr" maxLength={400} />}
        </Field>
        <Field label={f.sortOrder} error={err('sortOrder')}>
          {(field) => <Input {...field} {...register('sortOrder')} inputMode="numeric" dir="ltr" />}
        </Field>
        <Field label={f.ctaLabelAr} error={err('ctaLabelAr')}>
          {(field) => <Input {...field} {...register('ctaLabelAr')} dir="rtl" maxLength={60} />}
        </Field>
        <Field label={f.ctaLabelEn} error={err('ctaLabelEn')}>
          {(field) => <Input {...field} {...register('ctaLabelEn')} dir="ltr" maxLength={60} />}
        </Field>
        <div />
        <Field label={f.altAr} error={err('altAr')}>
          {(field) => <Input {...field} {...register('altAr')} dir="rtl" maxLength={200} />}
        </Field>
        <Field label={f.altEn} error={err('altEn')}>
          {(field) => <Input {...field} {...register('altEn')} dir="ltr" maxLength={200} />}
        </Field>
        <div />
        <Field label={f.startsAt} error={err('startsAt')}>
          {(field) => (
            <Input {...field} {...register('startsAt')} type="datetime-local" dir="ltr" />
          )}
        </Field>
        <Field label={f.endsAt} error={err('endsAt')}>
          {(field) => <Input {...field} {...register('endsAt')} type="datetime-local" dir="ltr" />}
        </Field>
      </div>
      <Checkbox label={f.isActive} {...register('isActive')} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={formState.isSubmitting} data-testid="banner-save">
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
