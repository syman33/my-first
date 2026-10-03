'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { type Path, useForm } from 'react-hook-form'
import { Badge } from '@/components/admin/ui'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Select } from '@/components/ui/field'
import { ColorFamily } from '@/generated/prisma/enums'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { formatMoney, formatNumber } from '@/i18n/format'
import { ApiClientError, apiRequest } from '@/lib/client/api'
import type { AdminImageView, AdminVariantView } from '@/types/admin-catalog'
import { fieldErrorsFrom, inputToInt, inputToMoney, moneyToInput } from './form-helpers'

type Labels = Dictionary['admin']['products']

interface VariantFormValues {
  sku: string
  barcode: string
  nameAr: string
  nameEn: string
  colorFamily: string
  colorNameAr: string
  colorNameEn: string
  colorHex: string
  size: string
  price: string
  compareAtPrice: string
  imageId: string
  isActive: boolean
  isDefault: boolean
  sortOrder: string
  lowStockThreshold: string
  initialStock: string
}

function toValues(variant: AdminVariantView | null, nextSort: number): VariantFormValues {
  return {
    sku: variant?.sku ?? '',
    barcode: variant?.barcode ?? '',
    nameAr: variant?.nameAr ?? '',
    nameEn: variant?.nameEn ?? '',
    colorFamily: variant?.colorFamily ?? '',
    colorNameAr: variant?.colorNameAr ?? '',
    colorNameEn: variant?.colorNameEn ?? '',
    colorHex: variant?.colorHex ?? '',
    size: variant?.size ?? '',
    price: moneyToInput(variant?.price ?? null),
    compareAtPrice: moneyToInput(variant?.compareAtPrice ?? null),
    imageId: variant?.imageId ?? '',
    isActive: variant?.isActive ?? true,
    isDefault: variant?.isDefault ?? false,
    sortOrder: String(variant?.sortOrder ?? nextSort),
    lowStockThreshold: variant?.lowStockThreshold?.toString() ?? '',
    initialStock: '0',
  }
}

interface ManagerProps {
  locale: Locale
  productId: string
  variants: AdminVariantView[]
  images: AdminImageView[]
  canManage: boolean
  canAdjustStock: boolean
  t: Labels
  formLabels: Dictionary['admin']['form']
  colorLabels: Dictionary['store']['colors']
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
}

/** Variants with their stock; prices and attributes are edited here, quantities on the inventory page. */
export function VariantsManager(props: ManagerProps) {
  const { locale, variants, canManage, canAdjustStock, t } = props
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const v = t.variant
  const ar = locale === 'ar'

  return (
    <div className="space-y-4" data-testid="variants-manager">
      {variants.length === 0 ? <p className="text-sm text-muted">{v.none}</p> : null}
      <ul className="divide-y divide-line border-y border-line">
        {variants.map((variant) => (
          <li key={variant.id} className="py-3">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="min-w-48 flex-1">
                <p className="font-medium text-ink">{ar ? variant.nameAr : variant.nameEn}</p>
                <p className="ltr-nums text-xs text-muted">{variant.sku}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {variant.isDefault ? <Badge tone="accent">{v.default}</Badge> : null}
                  {!variant.isActive ? <Badge tone="neutral">{v.inactive}</Badge> : null}
                </div>
              </div>
              <p className="ltr-nums w-32 text-muted">
                {variant.price !== null ? formatMoney(variant.price, locale) : '—'}
              </p>
              <dl className="flex gap-4 text-xs">
                <div>
                  <dt className="text-muted">{v.onHand}</dt>
                  <dd className="tabular-nums">{formatNumber(variant.onHand, locale)}</dd>
                </div>
                <div>
                  <dt className="text-muted">{v.reserved}</dt>
                  <dd className="tabular-nums">{formatNumber(variant.reserved, locale)}</dd>
                </div>
                <div>
                  <dt className="text-muted">{v.available}</dt>
                  <dd className="font-medium tabular-nums">
                    {formatNumber(Math.max(variant.onHand - variant.reserved, 0), locale)}
                  </dd>
                </div>
              </dl>
              <div className="flex gap-2">
                {canAdjustStock ? (
                  <Link
                    href={`/admin/inventory/${variant.id}` as Route}
                    className="text-xs text-muted underline underline-offset-4 hover:text-ink"
                  >
                    {v.adjust}
                  </Link>
                ) : null}
                {canManage ? (
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => setEditing(editing === variant.id ? null : variant.id)}
                    aria-expanded={editing === variant.id}
                  >
                    {v.edit}
                  </Button>
                ) : null}
              </div>
            </div>
            {editing === variant.id ? (
              <VariantForm {...props} variant={variant} onClose={() => setEditing(null)} />
            ) : null}
          </li>
        ))}
      </ul>
      {canManage ? (
        editing === 'new' ? (
          <VariantForm {...props} variant={null} onClose={() => setEditing(null)} />
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setEditing('new')}
            data-testid="variant-add"
          >
            {v.add}
          </Button>
        )
      ) : null}
      <p className="text-xs text-muted">{v.stockHint}</p>
    </div>
  )
}

function VariantForm({
  locale,
  productId,
  variants,
  images,
  t,
  formLabels,
  colorLabels,
  fieldMessages,
  genericError,
  variant,
  onClose,
}: ManagerProps & { variant: AdminVariantView | null; onClose: () => void }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const v = t.variant
  const creating = variant === null
  const { register, handleSubmit, setError, getValues, formState } = useForm<VariantFormValues>({
    defaultValues: toValues(variant, variants.length),
  })
  const err = (name: keyof VariantFormValues) => formState.errors[name]?.message
  const fail = (name: Path<VariantFormValues>, key: keyof typeof fieldMessages) =>
    setError(name, { type: 'validate', message: fieldMessages[key] }, { shouldFocus: true })

  async function submit(values: VariantFormValues) {
    setFormError(null)
    const price = inputToMoney(values.price)
    const compareAtPrice = inputToMoney(values.compareAtPrice)
    const sortOrder = inputToInt(values.sortOrder)
    const lowStockThreshold = inputToInt(values.lowStockThreshold)
    if (price === undefined || price === 0) return fail('price', 'amount')
    if (compareAtPrice === undefined) return fail('compareAtPrice', 'amount')
    if (sortOrder === undefined || sortOrder === null) return fail('sortOrder', 'invalid')
    if (lowStockThreshold === undefined) return fail('lowStockThreshold', 'invalid')
    const body = {
      sku: values.sku,
      barcode: values.barcode,
      nameAr: values.nameAr,
      nameEn: values.nameEn,
      colorFamily: values.colorFamily || null,
      colorNameAr: values.colorNameAr,
      colorNameEn: values.colorNameEn,
      colorHex: values.colorHex,
      size: values.size,
      price,
      compareAtPrice,
      imageId: values.imageId || null,
      isActive: values.isActive,
      isDefault: values.isDefault,
      sortOrder,
      lowStockThreshold,
    }
    try {
      if (creating) {
        const initialStock = inputToInt(values.initialStock)
        if (initialStock === undefined || initialStock === null)
          return fail('initialStock', 'quantity')
        await apiRequest(`/api/admin/products/${productId}/variants`, {
          body: { variant: body, initialStock },
          locale,
        })
      } else {
        await apiRequest(`/api/admin/variants/${variant.id}`, { method: 'PUT', body, locale })
      }
      onClose()
      startTransition(() => router.refresh())
    } catch (error) {
      const fields = fieldErrorsFrom(error, ['variant'])
      let unmatched = Object.keys(fields).length === 0
      for (const [key, message] of Object.entries(fields)) {
        if (key in getValues())
          setError(key as Path<VariantFormValues>, { type: 'server', message })
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
      data-testid="variant-form"
    >
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={v.sku} error={err('sku')}>
          {(field) => (
            <Input
              {...field}
              {...register('sku', { required: fieldMessages.required })}
              dir="ltr"
              maxLength={64}
            />
          )}
        </Field>
        <Field label={v.nameAr} error={err('nameAr')}>
          {(field) => (
            <Input
              {...field}
              {...register('nameAr', { required: fieldMessages.required })}
              dir="rtl"
              maxLength={160}
            />
          )}
        </Field>
        <Field label={v.nameEn} error={err('nameEn')}>
          {(field) => (
            <Input
              {...field}
              {...register('nameEn', { required: fieldMessages.required })}
              dir="ltr"
              maxLength={160}
            />
          )}
        </Field>
        <Field label={v.price} hint={v.priceHint} error={err('price')}>
          {(field) => <Input {...field} {...register('price')} inputMode="decimal" dir="ltr" />}
        </Field>
        <Field label={v.compareAtPrice} error={err('compareAtPrice')}>
          {(field) => (
            <Input {...field} {...register('compareAtPrice')} inputMode="decimal" dir="ltr" />
          )}
        </Field>
        <Field label={v.barcode} error={err('barcode')}>
          {(field) => <Input {...field} {...register('barcode')} dir="ltr" maxLength={64} />}
        </Field>
        <Field label={v.colorFamily} error={err('colorFamily')}>
          {(field) => (
            <Select {...field} {...register('colorFamily')}>
              <option value="">—</option>
              {Object.values(ColorFamily).map((family) => (
                <option key={family} value={family}>
                  {colorLabels[family]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={v.colorNameAr} error={err('colorNameAr')}>
          {(field) => <Input {...field} {...register('colorNameAr')} dir="rtl" maxLength={80} />}
        </Field>
        <Field label={v.colorNameEn} error={err('colorNameEn')}>
          {(field) => <Input {...field} {...register('colorNameEn')} dir="ltr" maxLength={80} />}
        </Field>
        <Field label={v.colorHex} error={err('colorHex')}>
          {(field) => (
            <Input
              {...field}
              {...register('colorHex')}
              dir="ltr"
              placeholder="#B89B72"
              maxLength={7}
            />
          )}
        </Field>
        <Field label={v.size} error={err('size')}>
          {(field) => <Input {...field} {...register('size')} maxLength={40} />}
        </Field>
        <Field label={v.image} error={err('imageId')}>
          {(field) => (
            <Select {...field} {...register('imageId')}>
              <option value="">{v.noImage}</option>
              {images.map((image, index) => (
                <option key={image.id} value={image.id}>
                  #{index + 1} {(locale === 'ar' ? image.altAr : image.altEn) ?? ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={v.sortOrder} error={err('sortOrder')}>
          {(field) => <Input {...field} {...register('sortOrder')} inputMode="numeric" dir="ltr" />}
        </Field>
        <Field label={v.lowStockThreshold} error={err('lowStockThreshold')}>
          {(field) => (
            <Input {...field} {...register('lowStockThreshold')} inputMode="numeric" dir="ltr" />
          )}
        </Field>
        {creating ? (
          <Field label={t.fields.initialStock} error={err('initialStock')}>
            {(field) => (
              <Input {...field} {...register('initialStock')} inputMode="numeric" dir="ltr" />
            )}
          </Field>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-6">
        <Checkbox label={v.isActive} error={err('isActive')} {...register('isActive')} />
        <Checkbox label={v.isDefault} {...register('isDefault')} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={formState.isSubmitting} data-testid="variant-save">
          {v.save}
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
