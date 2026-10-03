'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { type Path, useForm, useWatch } from 'react-hook-form'
import {
  inputToInt,
  inputToMoney,
  fieldErrorsFrom,
  moneyToInput,
} from '@/components/admin/catalog/form-helpers'
import { DeleteButton } from '@/components/admin/delete-button'
import { Badge } from '@/components/admin/ui'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field'
import { type Dictionary, plural } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { ApiClientError, apiRequest } from '@/lib/client/api'
import { bpsToPercent, percentToBps } from '@/utils/percent'

export interface CouponRow {
  id: string
  code: string
  descriptionAr: string | null
  descriptionEn: string | null
  type: 'PERCENTAGE' | 'FIXED_AMOUNT'
  value: number
  minOrderAmount: number | null
  maxDiscountAmount: number | null
  /** Store-local "YYYY-MM-DDTHH:mm" (pre-formatted on the server). */
  startsAt: string
  expiresAt: string
  usageLimit: number | null
  usageLimitPerUser: number | null
  usedCount: number
  scope: 'ALL' | 'PRODUCTS' | 'CATEGORIES'
  productSkus: string[]
  categoryIds: string[]
  isActive: boolean
  /** Display strings */
  discountText: string
  windowText: string
}

interface Values {
  code: string
  descriptionAr: string
  descriptionEn: string
  type: 'PERCENTAGE' | 'FIXED_AMOUNT'
  value: string
  minOrderAmount: string
  maxDiscountAmount: string
  startsAt: string
  expiresAt: string
  usageLimit: string
  usageLimitPerUser: string
  scope: 'ALL' | 'PRODUCTS' | 'CATEGORIES'
  productSkus: string
  categoryIds: string[]
  isActive: boolean
}

interface EditorProps {
  locale: Locale
  coupons: CouponRow[]
  categories: { id: string; name: string }[]
  t: Dictionary['admin']['coupons']
  formLabels: Dictionary['admin']['form']
  emptyLabel: string
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
}

export function CouponEditor(props: EditorProps) {
  const { locale, coupons, t, formLabels, genericError } = props
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  return (
    <div className="space-y-4">
      {editing === 'new' ? (
        <CouponForm {...props} coupon={null} onClose={() => setEditing(null)} />
      ) : (
        <Button size="sm" onClick={() => setEditing('new')} data-testid="coupon-new">
          {t.new}
        </Button>
      )}
      <ul className="divide-y divide-line border border-line bg-paper">
        {coupons.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-muted">{props.emptyLabel}</li>
        ) : null}
        {coupons.map((coupon) => (
          <li key={coupon.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="ltr-nums min-w-32 font-semibold tracking-wide text-ink">
                {coupon.code}
              </span>
              <span className="min-w-32 text-text">{coupon.discountText}</span>
              <span className="text-xs text-muted">{t.scopes[coupon.scope]}</span>
              <span className="text-xs text-muted">
                {plural(locale, coupon.usedCount, t.usedCount)}
                {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ''}
              </span>
              <span className="flex-1 text-xs text-muted">{coupon.windowText}</span>
              <Badge tone={coupon.isActive ? 'success' : 'neutral'}>
                {coupon.isActive ? t.active : t.inactive}
              </Badge>
              <Button
                size="sm"
                variant="subtle"
                onClick={() => setEditing(editing === coupon.id ? null : coupon.id)}
                aria-expanded={editing === coupon.id}
              >
                {t.edit}
              </Button>
              <DeleteButton
                locale={locale}
                endpoint={`/api/admin/coupons/${coupon.id}`}
                label={t.delete}
                confirmText={t.deleteConfirm}
                yesLabel={formLabels.yes}
                noLabel={formLabels.no}
                reasons={{ USED: t.used }}
                genericError={genericError}
              />
            </div>
            {editing === coupon.id ? (
              <CouponForm {...props} coupon={coupon} onClose={() => setEditing(null)} />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CouponForm({
  locale,
  categories,
  t,
  formLabels,
  fieldMessages,
  genericError,
  coupon,
  onClose,
}: EditorProps & { coupon: CouponRow | null; onClose: () => void }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const f = t.fields
  const { register, handleSubmit, setError, getValues, control, formState } = useForm<Values>({
    defaultValues: {
      code: coupon?.code ?? '',
      descriptionAr: coupon?.descriptionAr ?? '',
      descriptionEn: coupon?.descriptionEn ?? '',
      type: coupon?.type ?? 'PERCENTAGE',
      value: coupon
        ? coupon.type === 'PERCENTAGE'
          ? bpsToPercent(coupon.value)
          : moneyToInput(coupon.value)
        : '',
      minOrderAmount: moneyToInput(coupon?.minOrderAmount ?? null),
      maxDiscountAmount: moneyToInput(coupon?.maxDiscountAmount ?? null),
      startsAt: coupon?.startsAt ?? '',
      expiresAt: coupon?.expiresAt ?? '',
      usageLimit: coupon?.usageLimit?.toString() ?? '',
      usageLimitPerUser: coupon?.usageLimitPerUser?.toString() ?? '1',
      scope: coupon?.scope ?? 'ALL',
      productSkus: coupon?.productSkus.join('\n') ?? '',
      categoryIds: coupon?.categoryIds ?? [],
      isActive: coupon?.isActive ?? true,
    },
  })
  const type = useWatch({ control, name: 'type' })
  const scope = useWatch({ control, name: 'scope' })
  const err = (name: keyof Values) => formState.errors[name]?.message
  const fail = (name: Path<Values>, key: keyof typeof fieldMessages) =>
    setError(name, { type: 'validate', message: fieldMessages[key] }, { shouldFocus: true })

  async function submit(values: Values) {
    setFormError(null)
    const value =
      values.type === 'PERCENTAGE' ? percentToBps(values.value) : inputToMoney(values.value)
    if (
      value === undefined ||
      value === null ||
      value <= 0 ||
      (values.type === 'PERCENTAGE' && value > 10_000)
    )
      return fail('value', 'amount')
    const minOrderAmount = inputToMoney(values.minOrderAmount)
    if (minOrderAmount === undefined) return fail('minOrderAmount', 'amount')
    const maxDiscountAmount = inputToMoney(values.maxDiscountAmount)
    if (maxDiscountAmount === undefined || maxDiscountAmount === 0)
      return fail('maxDiscountAmount', 'amount')
    const usageLimit = inputToInt(values.usageLimit)
    if (usageLimit === undefined || usageLimit === 0) return fail('usageLimit', 'invalid')
    const usageLimitPerUser = inputToInt(values.usageLimitPerUser)
    if (usageLimitPerUser === undefined || usageLimitPerUser === 0)
      return fail('usageLimitPerUser', 'invalid')
    const body = {
      code: values.code,
      descriptionAr: values.descriptionAr,
      descriptionEn: values.descriptionEn,
      type: values.type,
      value,
      minOrderAmount,
      maxDiscountAmount: values.type === 'PERCENTAGE' ? maxDiscountAmount : null,
      startsAt: values.startsAt || null,
      expiresAt: values.expiresAt || null,
      usageLimit,
      usageLimitPerUser,
      scope: values.scope,
      productSkus:
        values.scope === 'PRODUCTS' ? values.productSkus.split(/[\s,]+/).filter(Boolean) : [],
      categoryIds: values.scope === 'CATEGORIES' ? values.categoryIds : [],
      isActive: values.isActive,
    }
    try {
      await apiRequest(coupon ? `/api/admin/coupons/${coupon.id}` : '/api/admin/coupons', {
        method: coupon ? 'PUT' : 'POST',
        body,
        locale,
      })
      onClose()
      startTransition(() => router.refresh())
    } catch (error) {
      const fields = fieldErrorsFrom(error)
      let unmatched = Object.keys(fields).length === 0
      for (const [key, message] of Object.entries(fields)) {
        if (key in getValues()) {
          const extra =
            key === 'productSkus' &&
            error instanceof ApiClientError &&
            Array.isArray(error.details.skus)
              ? ` ${(error.details.skus as string[]).join(', ')}`
              : ''
          setError(key as Path<Values>, { type: 'server', message: message + extra })
        } else unmatched = true
      }
      if (unmatched) setFormError(error instanceof ApiClientError ? error.message : genericError)
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(submit)(event)}
      noValidate
      className="mt-3 space-y-4 border border-line bg-ivory/60 p-4"
      data-testid="coupon-form"
    >
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Field label={f.code} error={err('code')}>
          {(field) => (
            <Input
              {...field}
              {...register('code', { required: fieldMessages.required })}
              dir="ltr"
              maxLength={40}
              autoCapitalize="characters"
            />
          )}
        </Field>
        <Field label={f.type} error={err('type')}>
          {(field) => (
            <Select {...field} {...register('type')}>
              <option value="PERCENTAGE">{t.types.PERCENTAGE}</option>
              <option value="FIXED_AMOUNT">{t.types.FIXED_AMOUNT}</option>
            </Select>
          )}
        </Field>
        <Field label={type === 'PERCENTAGE' ? f.percent : f.amount} error={err('value')}>
          {(field) => (
            <Input
              {...field}
              {...register('value', { required: fieldMessages.required })}
              inputMode="decimal"
              dir="ltr"
            />
          )}
        </Field>
        <Field label={f.minOrderAmount} error={err('minOrderAmount')}>
          {(field) => (
            <Input {...field} {...register('minOrderAmount')} inputMode="decimal" dir="ltr" />
          )}
        </Field>
        {type === 'PERCENTAGE' ? (
          <Field
            label={f.maxDiscountAmount}
            hint={f.maxDiscountHint}
            error={err('maxDiscountAmount')}
          >
            {(field) => (
              <Input {...field} {...register('maxDiscountAmount')} inputMode="decimal" dir="ltr" />
            )}
          </Field>
        ) : (
          <div />
        )}
        <div />
        <Field label={f.startsAt} error={err('startsAt')}>
          {(field) => (
            <Input {...field} {...register('startsAt')} type="datetime-local" dir="ltr" />
          )}
        </Field>
        <Field label={f.expiresAt} error={err('expiresAt')}>
          {(field) => (
            <Input {...field} {...register('expiresAt')} type="datetime-local" dir="ltr" />
          )}
        </Field>
        <div />
        <Field label={f.usageLimit} hint={f.limitHint} error={err('usageLimit')}>
          {(field) => (
            <Input {...field} {...register('usageLimit')} inputMode="numeric" dir="ltr" />
          )}
        </Field>
        <Field label={f.usageLimitPerUser} hint={f.limitHint} error={err('usageLimitPerUser')}>
          {(field) => (
            <Input {...field} {...register('usageLimitPerUser')} inputMode="numeric" dir="ltr" />
          )}
        </Field>
        <Field label={f.scope} error={err('scope')}>
          {(field) => (
            <Select {...field} {...register('scope')}>
              {(['ALL', 'PRODUCTS', 'CATEGORIES'] as const).map((option) => (
                <option key={option} value={option}>
                  {t.scopes[option]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={f.descriptionAr} error={err('descriptionAr')}>
          {(field) => <Input {...field} {...register('descriptionAr')} dir="rtl" maxLength={300} />}
        </Field>
        <Field label={f.descriptionEn} error={err('descriptionEn')}>
          {(field) => <Input {...field} {...register('descriptionEn')} dir="ltr" maxLength={300} />}
        </Field>
      </div>
      {scope === 'PRODUCTS' ? (
        <Field label={f.productSkus} error={err('productSkus')}>
          {(field) => (
            <Textarea {...field} {...register('productSkus')} className="min-h-24" dir="ltr" />
          )}
        </Field>
      ) : null}
      {scope === 'CATEGORIES' ? (
        <fieldset>
          <legend className="text-sm font-medium text-ink">{f.categories}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {categories.map((category) => (
              <Checkbox
                key={category.id}
                label={category.name}
                value={category.id}
                {...register('categoryIds')}
              />
            ))}
          </div>
          {err('categoryIds') ? (
            <p role="alert" className="mt-2 text-xs text-danger">
              {err('categoryIds')}
            </p>
          ) : null}
        </fieldset>
      ) : null}
      <Checkbox label={f.isActive} {...register('isActive')} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={formState.isSubmitting} data-testid="coupon-save">
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
