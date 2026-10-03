'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input, Textarea } from '@/components/ui/field'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { apiRequest } from '@/lib/client/api'
import { applyServerErrors, localizeResolver } from '@/lib/client/forms'
import { addressSchema, type AddressInput } from '@/schemas/address'

const ADDRESS_FIELDS = [
  'label',
  'fullName',
  'phone',
  'city',
  'district',
  'street',
  'buildingNumber',
  'postalCode',
  'additionalNumber',
  'shortAddress',
  'instructions',
  'isDefault',
] as const

export const EMPTY_ADDRESS: AddressInput = {
  label: '',
  fullName: '',
  phone: '',
  city: '',
  district: '',
  street: '',
  buildingNumber: '',
  postalCode: '',
  additionalNumber: '',
  shortAddress: '',
  instructions: '',
  isDefault: false,
}

interface AddressFormProps {
  locale: Locale
  t: Dictionary['account']['addresses']
  optionalLabel: string
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
  /** Existing address id when editing; omitted when adding. */
  addressId?: string
  initialValues?: AddressInput
  /** Hide the "make default" option (e.g. the address already is the default). */
  hideDefaultToggle?: boolean
  onSaved: () => void
  onCancel?: () => void
}

/** National Address form, reused by the address book and checkout. */
export function AddressForm({
  locale,
  t,
  optionalLabel,
  fieldMessages,
  genericError,
  addressId,
  initialValues = EMPTY_ADDRESS,
  hideDefaultToggle = false,
  onSaved,
  onCancel,
}: AddressFormProps) {
  const [formError, setFormError] = useState<string | null>(null)
  const f = t.fields
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AddressInput, unknown, z.output<typeof addressSchema>>({
    resolver: localizeResolver(zodResolver(addressSchema), fieldMessages),
    defaultValues: initialValues,
  })

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await apiRequest(
        addressId ? `/api/account/addresses/${addressId}` : '/api/account/addresses',
        {
          method: addressId ? 'PATCH' : 'POST',
          body: values,
          locale,
        },
      )
      onSaved()
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ADDRESS_FIELDS, genericError))
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" data-testid="address-form">
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <Field
        label={f.label}
        hint={f.labelHint}
        optionalLabel={optionalLabel}
        error={errors.label?.message}
      >
        {(props) => <Input {...props} {...register('label')} />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={f.fullName} error={errors.fullName?.message}>
          {(props) => <Input {...props} {...register('fullName')} autoComplete="name" />}
        </Field>
        <Field label={f.phone} error={errors.phone?.message}>
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
        <Field label={f.city} error={errors.city?.message}>
          {(props) => <Input {...props} {...register('city')} autoComplete="address-level2" />}
        </Field>
        <Field label={f.district} error={errors.district?.message}>
          {(props) => <Input {...props} {...register('district')} autoComplete="address-level3" />}
        </Field>
      </div>
      <Field label={f.street} error={errors.street?.message}>
        {(props) => <Input {...props} {...register('street')} autoComplete="address-line1" />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label={f.buildingNumber} error={errors.buildingNumber?.message}>
          {(props) => (
            <Input
              {...props}
              {...register('buildingNumber')}
              inputMode="numeric"
              maxLength={4}
              dir="ltr"
            />
          )}
        </Field>
        <Field label={f.postalCode} error={errors.postalCode?.message}>
          {(props) => (
            <Input
              {...props}
              {...register('postalCode')}
              inputMode="numeric"
              maxLength={5}
              autoComplete="postal-code"
              dir="ltr"
            />
          )}
        </Field>
        <Field
          label={f.additionalNumber}
          optionalLabel={optionalLabel}
          error={errors.additionalNumber?.message}
        >
          {(props) => (
            <Input
              {...props}
              {...register('additionalNumber')}
              inputMode="numeric"
              maxLength={4}
              dir="ltr"
            />
          )}
        </Field>
      </div>
      <Field
        label={f.shortAddress}
        hint={f.shortAddressHint}
        optionalLabel={optionalLabel}
        error={errors.shortAddress?.message}
      >
        {(props) => (
          <Input
            {...props}
            {...register('shortAddress')}
            maxLength={8}
            autoCapitalize="characters"
            dir="ltr"
          />
        )}
      </Field>
      <Field
        label={f.instructions}
        optionalLabel={optionalLabel}
        error={errors.instructions?.message}
      >
        {(props) => <Textarea {...props} {...register('instructions')} rows={3} maxLength={500} />}
      </Field>
      {hideDefaultToggle ? null : <Checkbox {...register('isDefault')} label={f.isDefault} />}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={isSubmitting}>
          {t.save}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            {t.cancel}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
