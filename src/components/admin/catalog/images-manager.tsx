'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Trash2, Upload } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { ApiClientError, apiRequest, apiUpload } from '@/lib/client/api'
import type { AdminImageView } from '@/types/admin-catalog'

type Labels = Dictionary['admin']['products']['images']

/** Gallery editor: upload (validated server-side), alt text in both languages, order and removal. */
export function ImagesManager({
  locale,
  productId,
  images,
  t,
  genericError,
}: {
  locale: Locale
  productId: string
  images: AdminImageView[]
  t: Labels
  genericError: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const refresh = () => startTransition(() => router.refresh())

  function explain(caught: unknown): string {
    if (caught instanceof ApiClientError) {
      const reason = caught.details.reason
      if (typeof reason === 'string' && reason in t.rejected)
        return t.rejected[reason as keyof Labels['rejected']]
      return caught.message
    }
    return genericError
  }

  async function run(task: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await task()
      refresh()
    } catch (caught) {
      setError(explain(caught))
    } finally {
      setBusy(false)
    }
  }

  async function upload(file: File) {
    const form = new FormData()
    form.set('file', file)
    await run(() => apiUpload(`/api/admin/products/${productId}/images`, form, { locale }))
    if (fileInput.current) fileInput.current.value = ''
  }

  function move(index: number, offset: -1 | 1) {
    const ids = images.map((image) => image.id)
    const target = index + offset
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
    void run(() =>
      apiRequest(`/api/admin/products/${productId}/images/order`, {
        method: 'PUT',
        body: { imageIds: ids },
        locale,
      }),
    )
  }

  return (
    <div className="space-y-4" data-testid="images-manager">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {images.length === 0 ? <p className="text-sm text-muted">{t.empty}</p> : null}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {images.map((image, index) => (
          <li key={image.id} className="border border-line">
            <div className="relative aspect-[4/5] bg-sand">
              <Image
                src={image.url}
                alt={(locale === 'ar' ? image.altAr : image.altEn) ?? ''}
                fill
                sizes="(min-width: 1280px) 20vw, 45vw"
                className="object-cover"
              />
              {index === 0 ? (
                <span className="absolute start-2 top-2 bg-ink px-2 py-0.5 text-xs text-paper">
                  {t.main}
                </span>
              ) : null}
            </div>
            <AltEditor
              locale={locale}
              image={image}
              t={t}
              disabled={busy}
              onSave={(alt) =>
                run(() =>
                  apiRequest(`/api/admin/images/${image.id}`, {
                    method: 'PATCH',
                    body: alt,
                    locale,
                  }),
                )
              }
            />
            <div className="flex items-center justify-between gap-2 border-t border-line p-2">
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={t.moveUp}
                >
                  <ArrowUp className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || index === images.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={t.moveDown}
                >
                  <ArrowDown className="size-4" aria-hidden="true" />
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(t.removeConfirm))
                    void run(() =>
                      apiRequest(`/api/admin/images/${image.id}`, { method: 'DELETE', locale }),
                    )
                }}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                {t.remove}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="space-y-2">
        <label className="inline-flex cursor-pointer items-center gap-2 border border-ink px-4 py-2 text-sm text-ink hover:bg-ink hover:text-paper has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50">
          <Upload className="size-4" aria-hidden="true" />
          {busy ? t.uploading : t.upload}
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
            }}
            data-testid="image-upload"
          />
        </label>
        <p className="text-xs text-muted">{t.hint}</p>
      </div>
    </div>
  )
}

function AltEditor({
  locale,
  image,
  t,
  disabled,
  onSave,
}: {
  locale: Locale
  image: AdminImageView
  t: Labels
  disabled: boolean
  onSave: (alt: { altAr: string | null; altEn: string | null }) => Promise<void>
}) {
  const [altAr, setAltAr] = useState(image.altAr ?? '')
  const [altEn, setAltEn] = useState(image.altEn ?? '')
  const changed = altAr !== (image.altAr ?? '') || altEn !== (image.altEn ?? '')
  return (
    <div className="space-y-2 p-2" lang={locale}>
      <Input
        value={altAr}
        onChange={(event) => setAltAr(event.target.value)}
        aria-label={t.altAr}
        placeholder={t.altAr}
        dir="rtl"
        maxLength={200}
        className="h-9 text-xs"
      />
      <Input
        value={altEn}
        onChange={(event) => setAltEn(event.target.value)}
        aria-label={t.altEn}
        placeholder={t.altEn}
        dir="ltr"
        maxLength={200}
        className="h-9 text-xs"
      />
      {changed ? (
        <Button
          size="sm"
          variant="subtle"
          disabled={disabled}
          onClick={() => void onSave({ altAr: altAr.trim() || null, altEn: altEn.trim() || null })}
        >
          {t.saveAlt}
        </Button>
      ) : null}
    </div>
  )
}
