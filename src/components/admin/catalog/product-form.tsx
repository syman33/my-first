'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { type Path, useForm } from 'react-hook-form'
import { Card } from '@/components/admin/ui'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field'
import { ColorFamily, Gender } from '@/generated/prisma/enums'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { ApiClientError, apiRequest } from '@/lib/client/api'
import type { AdminProductDetail, CatalogOption } from '@/types/admin-catalog'
import { slugify } from '@/utils/text'
import { fieldErrorsFrom, inputToInt, inputToMoney, moneyToInput } from './form-helpers'

interface FormValues {
  nameAr: string
  nameEn: string
  slugAr: string
  slugEn: string
  sku: string
  descriptionAr: string
  descriptionEn: string
  price: string
  compareAtPrice: string
  cost: string
  categoryId: string
  brandId: string
  gender: Gender
  materialAr: string
  materialEn: string
  careAr: string
  careEn: string
  lengthMm: string
  widthMm: string
  heightMm: string
  weightGrams: string
  isFeatured: boolean
  isBestseller: boolean
  isNewArrival: boolean
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  lowStockThreshold: string
  seoTitleAr: string
  seoTitleEn: string
  seoDescriptionAr: string
  seoDescriptionEn: string
  // First variant (create only)
  variantSku: string
  variantNameAr: string
  variantNameEn: string
  colorFamily: string
  colorNameAr: string
  colorNameEn: string
  colorHex: string
  size: string
  initialStock: string
}

function initialValues(product: AdminProductDetail | null): FormValues {
  return {
    nameAr: product?.nameAr ?? '',
    nameEn: product?.nameEn ?? '',
    slugAr: product?.slugAr ?? '',
    slugEn: product?.slugEn ?? '',
    sku: product?.sku ?? '',
    descriptionAr: product?.descriptionAr ?? '',
    descriptionEn: product?.descriptionEn ?? '',
    price: moneyToInput(product?.price ?? null),
    compareAtPrice: moneyToInput(product?.compareAtPrice ?? null),
    cost: moneyToInput(product?.cost ?? null),
    categoryId: product?.categoryId ?? '',
    brandId: product?.brandId ?? '',
    gender: product?.gender ?? 'UNISEX',
    materialAr: product?.materialAr ?? '',
    materialEn: product?.materialEn ?? '',
    careAr: product?.careAr ?? '',
    careEn: product?.careEn ?? '',
    lengthMm: product?.lengthMm?.toString() ?? '',
    widthMm: product?.widthMm?.toString() ?? '',
    heightMm: product?.heightMm?.toString() ?? '',
    weightGrams: product?.weightGrams?.toString() ?? '',
    isFeatured: product?.isFeatured ?? false,
    isBestseller: product?.isBestseller ?? false,
    isNewArrival: product?.isNewArrival ?? true,
    status: product?.status ?? 'DRAFT',
    lowStockThreshold: String(product?.lowStockThreshold ?? 3),
    seoTitleAr: product?.seoTitleAr ?? '',
    seoTitleEn: product?.seoTitleEn ?? '',
    seoDescriptionAr: product?.seoDescriptionAr ?? '',
    seoDescriptionEn: product?.seoDescriptionEn ?? '',
    variantSku: '',
    variantNameAr: '',
    variantNameEn: '',
    colorFamily: '',
    colorNameAr: '',
    colorNameEn: '',
    colorHex: '',
    size: '',
    initialStock: '0',
  }
}

const VARIANT_FIELD_MAP: Record<string, Path<FormValues>> = {
  sku: 'variantSku',
  nameAr: 'variantNameAr',
  nameEn: 'variantNameEn',
  colorFamily: 'colorFamily',
  colorNameAr: 'colorNameAr',
  colorNameEn: 'colorNameEn',
  colorHex: 'colorHex',
  size: 'size',
}

/** Create or edit a product's own fields. Variants, stock and images have their own panels. */
export function ProductForm({
  locale,
  product,
  categories,
  brands,
  t,
  formLabels,
  colorLabels,
  fieldMessages,
  genericError,
}: {
  locale: Locale
  product: AdminProductDetail | null
  categories: CatalogOption[]
  brands: CatalogOption[]
  t: Dictionary['admin']['products']
  formLabels: Dictionary['admin']['form']
  colorLabels: Dictionary['store']['colors']
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const creating = product === null
  const f = t.fields
  const ar = locale === 'ar'
  const { register, handleSubmit, setError, setValue, getValues, formState } = useForm<FormValues>({
    defaultValues: initialValues(product),
  })
  const { errors, isSubmitting } = formState
  const err = (name: keyof FormValues) => errors[name]?.message

  function fail(name: Path<FormValues>, key: keyof typeof fieldMessages) {
    setError(name, { type: 'validate', message: fieldMessages[key] }, { shouldFocus: true })
  }

  async function submit(values: FormValues) {
    setFormError(null)
    setSaved(false)
    const price = inputToMoney(values.price)
    const compareAtPrice = inputToMoney(values.compareAtPrice)
    const cost = inputToMoney(values.cost)
    const measures = {
      lengthMm: inputToInt(values.lengthMm),
      widthMm: inputToInt(values.widthMm),
      heightMm: inputToInt(values.heightMm),
      weightGrams: inputToInt(values.weightGrams),
    }
    const lowStockThreshold = inputToInt(values.lowStockThreshold)
    if (price === undefined || price === null || price <= 0) return fail('price', 'amount')
    if (compareAtPrice === undefined) return fail('compareAtPrice', 'amount')
    if (cost === undefined) return fail('cost', 'amount')
    for (const [name, value] of Object.entries(measures)) {
      if (value === undefined || value === 0) return fail(name as Path<FormValues>, 'invalid')
    }
    if (lowStockThreshold === undefined || lowStockThreshold === null)
      return fail('lowStockThreshold', 'invalid')

    const productBody = {
      nameAr: values.nameAr,
      nameEn: values.nameEn,
      slugAr: values.slugAr,
      slugEn: values.slugEn,
      sku: values.sku,
      descriptionAr: values.descriptionAr,
      descriptionEn: values.descriptionEn,
      price,
      compareAtPrice,
      cost,
      categoryId: values.categoryId,
      brandId: values.brandId || null,
      gender: values.gender,
      materialAr: values.materialAr,
      materialEn: values.materialEn,
      careAr: values.careAr,
      careEn: values.careEn,
      ...measures,
      isFeatured: values.isFeatured,
      isBestseller: values.isBestseller,
      isNewArrival: values.isNewArrival,
      status: values.status,
      lowStockThreshold,
      seoTitleAr: values.seoTitleAr,
      seoTitleEn: values.seoTitleEn,
      seoDescriptionAr: values.seoDescriptionAr,
      seoDescriptionEn: values.seoDescriptionEn,
    }

    try {
      if (creating) {
        const initialStock = inputToInt(values.initialStock)
        if (initialStock === undefined || initialStock === null)
          return fail('initialStock', 'quantity')
        const result = await apiRequest<{ product: { id: string } }>('/api/admin/products', {
          body: {
            product: productBody,
            firstVariant: {
              initialStock,
              variant: {
                sku: values.variantSku,
                barcode: null,
                nameAr: values.variantNameAr,
                nameEn: values.variantNameEn,
                colorFamily: values.colorFamily || null,
                colorNameAr: values.colorNameAr,
                colorNameEn: values.colorNameEn,
                colorHex: values.colorHex,
                size: values.size,
                price: null,
                compareAtPrice: null,
                imageId: null,
                isActive: true,
                isDefault: true,
                sortOrder: 0,
                lowStockThreshold: null,
              },
            },
          },
          locale,
        })
        router.replace(`/admin/products/${result.product.id}?created=1` as Route)
        return
      }
      await apiRequest(`/api/admin/products/${product.id}`, {
        method: 'PUT',
        body: productBody,
        locale,
      })
      setSaved(true)
      startTransition(() => router.refresh())
    } catch (error) {
      const fields = fieldErrorsFrom(error, ['product', 'firstVariant.variant', 'firstVariant'])
      let unmatched = Object.keys(fields).length === 0
      for (const [key, message] of Object.entries(fields)) {
        const name = (key in VARIANT_FIELD_MAP ? VARIANT_FIELD_MAP[key] : key) as Path<FormValues>
        if (name in getValues()) setError(name, { type: 'server', message })
        else unmatched = true
      }
      if (unmatched) setFormError(error instanceof ApiClientError ? error.message : genericError)
    }
  }

  const categoryOptions = categories.filter((category) => category.kind === 'STANDARD')
  const nameOf = (option: CatalogOption) => (ar ? option.nameAr : option.nameEn)

  return (
    <form
      onSubmit={(event) => void handleSubmit(submit)(event)}
      noValidate
      className="space-y-6"
      data-testid="product-form"
    >
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      {saved ? <Alert tone="success">{formLabels.saved}</Alert> : null}

      <Card title={t.sections.basics}>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label={f.nameAr} error={err('nameAr')}>
            {(props) => (
              <Input
                {...props}
                {...register('nameAr', { required: fieldMessages.required })}
                dir="rtl"
                maxLength={200}
              />
            )}
          </Field>
          <Field label={f.nameEn} error={err('nameEn')}>
            {(props) => (
              <Input
                {...props}
                {...register('nameEn', { required: fieldMessages.required })}
                dir="ltr"
                maxLength={200}
              />
            )}
          </Field>
          <Field label={f.slugAr} hint={f.slugHint} error={err('slugAr')}>
            {(props) => (
              <div className="flex gap-2">
                <Input
                  {...props}
                  {...register('slugAr', { required: fieldMessages.required })}
                  dir="rtl"
                  maxLength={180}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="subtle"
                  className="h-12 shrink-0"
                  onClick={() =>
                    setValue('slugAr', slugify(getValues('nameAr')), { shouldDirty: true })
                  }
                >
                  {f.generate}
                </Button>
              </div>
            )}
          </Field>
          <Field label={f.slugEn} hint={f.slugHint} error={err('slugEn')}>
            {(props) => (
              <div className="flex gap-2">
                <Input
                  {...props}
                  {...register('slugEn', { required: fieldMessages.required })}
                  dir="ltr"
                  maxLength={180}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="subtle"
                  className="h-12 shrink-0"
                  onClick={() =>
                    setValue('slugEn', slugify(getValues('nameEn')), { shouldDirty: true })
                  }
                >
                  {f.generate}
                </Button>
              </div>
            )}
          </Field>
          <Field label={f.sku} error={err('sku')}>
            {(props) => (
              <Input
                {...props}
                {...register('sku', { required: fieldMessages.required })}
                dir="ltr"
                maxLength={64}
                autoCapitalize="characters"
              />
            )}
          </Field>
          <div className="hidden md:block" />
          <Field label={f.descriptionAr} error={err('descriptionAr')} className="md:col-span-1">
            {(props) => (
              <Textarea {...props} {...register('descriptionAr')} dir="rtl" maxLength={5000} />
            )}
          </Field>
          <Field label={f.descriptionEn} error={err('descriptionEn')}>
            {(props) => (
              <Textarea {...props} {...register('descriptionEn')} dir="ltr" maxLength={5000} />
            )}
          </Field>
        </div>
      </Card>

      <Card title={t.sections.pricing}>
        <div className="grid gap-5 md:grid-cols-3">
          <Field label={f.price} hint={f.priceHint} error={err('price')}>
            {(props) => (
              <Input
                {...props}
                {...register('price', { required: fieldMessages.required })}
                inputMode="decimal"
                dir="ltr"
              />
            )}
          </Field>
          <Field label={f.compareAtPrice} error={err('compareAtPrice')}>
            {(props) => (
              <Input {...props} {...register('compareAtPrice')} inputMode="decimal" dir="ltr" />
            )}
          </Field>
          <Field label={f.cost} hint={f.costHint} error={err('cost')}>
            {(props) => <Input {...props} {...register('cost')} inputMode="decimal" dir="ltr" />}
          </Field>
        </div>
      </Card>

      <Card title={t.sections.organization}>
        <div className="grid gap-5 md:grid-cols-3">
          <Field label={f.category} error={err('categoryId')}>
            {(props) => (
              <Select {...props} {...register('categoryId', { required: fieldMessages.required })}>
                <option value="">—</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.parentId ? `— ${nameOf(category)}` : nameOf(category)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={f.brand} error={err('brandId')}>
            {(props) => (
              <Select {...props} {...register('brandId')}>
                <option value="">{f.noBrand}</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {nameOf(brand)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={f.gender} error={err('gender')}>
            {(props) => (
              <Select {...props} {...register('gender')}>
                {Object.values(Gender).map((gender) => (
                  <option key={gender} value={gender}>
                    {f.genders[gender]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </Card>

      <Card title={t.sections.details}>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label={f.materialAr} error={err('materialAr')}>
            {(props) => <Input {...props} {...register('materialAr')} dir="rtl" maxLength={200} />}
          </Field>
          <Field label={f.materialEn} error={err('materialEn')}>
            {(props) => <Input {...props} {...register('materialEn')} dir="ltr" maxLength={200} />}
          </Field>
          <Field label={f.careAr} error={err('careAr')}>
            {(props) => (
              <Textarea
                {...props}
                {...register('careAr')}
                className="min-h-20"
                dir="rtl"
                maxLength={2000}
              />
            )}
          </Field>
          <Field label={f.careEn} error={err('careEn')}>
            {(props) => (
              <Textarea
                {...props}
                {...register('careEn')}
                className="min-h-20"
                dir="ltr"
                maxLength={2000}
              />
            )}
          </Field>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 md:grid-cols-4">
          {(['lengthMm', 'widthMm', 'heightMm', 'weightGrams'] as const).map((name) => (
            <Field key={name} label={f[name]} error={err(name)}>
              {(props) => <Input {...props} {...register(name)} inputMode="numeric" dir="ltr" />}
            </Field>
          ))}
        </div>
      </Card>

      {creating ? (
        <Card title={t.sections.firstVariant}>
          <div className="grid gap-5 md:grid-cols-3">
            <Field label={t.variant.sku} error={err('variantSku')}>
              {(props) => (
                <Input
                  {...props}
                  {...register('variantSku', { required: fieldMessages.required })}
                  dir="ltr"
                  maxLength={64}
                />
              )}
            </Field>
            <Field label={t.variant.nameAr} error={err('variantNameAr')}>
              {(props) => (
                <Input
                  {...props}
                  {...register('variantNameAr', { required: fieldMessages.required })}
                  dir="rtl"
                  maxLength={160}
                />
              )}
            </Field>
            <Field label={t.variant.nameEn} error={err('variantNameEn')}>
              {(props) => (
                <Input
                  {...props}
                  {...register('variantNameEn', { required: fieldMessages.required })}
                  dir="ltr"
                  maxLength={160}
                />
              )}
            </Field>
            <Field label={t.variant.colorFamily} error={err('colorFamily')}>
              {(props) => (
                <Select {...props} {...register('colorFamily')}>
                  <option value="">—</option>
                  {Object.values(ColorFamily).map((family) => (
                    <option key={family} value={family}>
                      {colorLabels[family]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t.variant.colorNameAr} error={err('colorNameAr')}>
              {(props) => (
                <Input {...props} {...register('colorNameAr')} dir="rtl" maxLength={80} />
              )}
            </Field>
            <Field label={t.variant.colorNameEn} error={err('colorNameEn')}>
              {(props) => (
                <Input {...props} {...register('colorNameEn')} dir="ltr" maxLength={80} />
              )}
            </Field>
            <Field label={t.variant.colorHex} error={err('colorHex')}>
              {(props) => (
                <Input
                  {...props}
                  {...register('colorHex')}
                  dir="ltr"
                  placeholder="#B89B72"
                  maxLength={7}
                />
              )}
            </Field>
            <Field label={t.variant.size} error={err('size')}>
              {(props) => <Input {...props} {...register('size')} maxLength={40} />}
            </Field>
            <Field label={f.initialStock} error={err('initialStock')}>
              {(props) => (
                <Input {...props} {...register('initialStock')} inputMode="numeric" dir="ltr" />
              )}
            </Field>
          </div>
        </Card>
      ) : null}

      <Card title={t.sections.visibility}>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label={f.status} hint={f.statusHint} error={err('status')}>
            {(props) => (
              <Select {...props} {...register('status')}>
                {(['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const).map((status) => (
                  <option key={status} value={status} disabled={creating && status === 'PUBLISHED'}>
                    {t.statuses[status]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={f.lowStockThreshold} error={err('lowStockThreshold')}>
            {(props) => (
              <Input {...props} {...register('lowStockThreshold')} inputMode="numeric" dir="ltr" />
            )}
          </Field>
        </div>
        <div className="mt-5 flex flex-wrap gap-6">
          <Checkbox label={f.isFeatured} {...register('isFeatured')} />
          <Checkbox label={f.isBestseller} {...register('isBestseller')} />
          <Checkbox label={f.isNewArrival} {...register('isNewArrival')} />
        </div>
      </Card>

      <Card title={t.sections.seo}>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label={f.seoTitleAr} error={err('seoTitleAr')}>
            {(props) => <Input {...props} {...register('seoTitleAr')} dir="rtl" maxLength={160} />}
          </Field>
          <Field label={f.seoTitleEn} error={err('seoTitleEn')}>
            {(props) => <Input {...props} {...register('seoTitleEn')} dir="ltr" maxLength={160} />}
          </Field>
          <Field label={f.seoDescriptionAr} error={err('seoDescriptionAr')}>
            {(props) => (
              <Textarea
                {...props}
                {...register('seoDescriptionAr')}
                className="min-h-20"
                dir="rtl"
                maxLength={320}
              />
            )}
          </Field>
          <Field label={f.seoDescriptionEn} error={err('seoDescriptionEn')}>
            {(props) => (
              <Textarea
                {...props}
                {...register('seoDescriptionEn')}
                className="min-h-20"
                dir="ltr"
                maxLength={320}
              />
            )}
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end border-t border-line bg-paper/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        <Button type="submit" loading={isSubmitting} data-testid="product-save">
          {creating ? formLabels.create : formLabels.save}
        </Button>
      </div>
    </form>
  )
}
