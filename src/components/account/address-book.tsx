'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { apiRequest, ApiClientError } from '@/lib/client/api'
import { addressLines } from '@/utils/address'
import { formatSaudiMobile } from '@/utils/phone'
import { AddressForm, EMPTY_ADDRESS } from './address-form'

export interface AddressCardData {
  id: string
  label: string | null
  fullName: string
  phone: string
  city: string
  district: string
  street: string
  buildingNumber: string
  postalCode: string
  additionalNumber: string | null
  shortAddress: string | null
  instructions: string | null
  isDefault: boolean
}

interface AddressBookProps {
  locale: Locale
  t: Dictionary['account']['addresses']
  optionalLabel: string
  fieldMessages: Dictionary['errors']['fields']
  genericError: string
  addresses: AddressCardData[]
  maxAddresses: number
}

type Mode = { kind: 'list' } | { kind: 'add' } | { kind: 'edit'; id: string }

export function AddressBook({
  locale,
  t,
  optionalLabel,
  fieldMessages,
  genericError,
  addresses,
  maxAddresses,
}: AddressBookProps) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [refreshing, startRefresh] = useTransition()

  const formProps = { locale, t, optionalLabel, fieldMessages, genericError }

  function refresh(message?: string) {
    setMode({ kind: 'list' })
    setConfirmingDelete(null)
    setNotice(message ? { tone: 'success', text: message } : null)
    startRefresh(() => router.refresh())
  }

  async function mutate(id: string, action: () => Promise<unknown>, successMessage?: string) {
    setBusyId(id)
    setNotice(null)
    try {
      await action()
      refresh(successMessage)
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof ApiClientError ? error.message : genericError,
      })
    } finally {
      setBusyId(null)
    }
  }

  if (mode.kind === 'add') {
    return (
      <section aria-labelledby="address-form-title" className="border border-line bg-paper p-6">
        <h3 id="address-form-title" className="mb-6 font-display text-2xl text-ink">
          {t.add}
        </h3>
        <AddressForm
          {...formProps}
          initialValues={{ ...EMPTY_ADDRESS, isDefault: addresses.length === 0 }}
          onSaved={() => refresh(t.saved)}
          onCancel={() => setMode({ kind: 'list' })}
        />
      </section>
    )
  }

  if (mode.kind === 'edit') {
    const address = addresses.find((a) => a.id === mode.id)
    if (address) {
      return (
        <section aria-labelledby="address-form-title" className="border border-line bg-paper p-6">
          <h3 id="address-form-title" className="mb-6 font-display text-2xl text-ink">
            {t.edit}
          </h3>
          <AddressForm
            {...formProps}
            addressId={address.id}
            hideDefaultToggle={address.isDefault}
            initialValues={{
              label: address.label ?? '',
              fullName: address.fullName,
              phone: formatSaudiMobile(address.phone),
              city: address.city,
              district: address.district,
              street: address.street,
              buildingNumber: address.buildingNumber,
              postalCode: address.postalCode,
              additionalNumber: address.additionalNumber ?? '',
              shortAddress: address.shortAddress ?? '',
              instructions: address.instructions ?? '',
              isDefault: address.isDefault,
            }}
            onSaved={() => refresh(t.saved)}
            onCancel={() => setMode({ kind: 'list' })}
          />
        </section>
      )
    }
  }

  return (
    <div className="space-y-6" aria-busy={refreshing || undefined}>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      {addresses.length === 0 ? <p className="text-muted">{t.empty}</p> : null}
      <ul className="grid gap-4 md:grid-cols-2">
        {addresses.map((address) => (
          <li
            key={address.id}
            className="flex flex-col border border-line bg-paper p-5"
            data-testid="address-card"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-ink">{address.label || address.fullName}</p>
              {address.isDefault ? (
                <span className="shrink-0 bg-champagne-soft px-2 py-0.5 text-xs text-champagne-strong">
                  {t.default}
                </span>
              ) : null}
            </div>
            <address className="mt-3 flex-1 space-y-0.5 text-sm text-text not-italic">
              {address.label ? <p>{address.fullName}</p> : null}
              {addressLines(address, locale).map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p className="ltr-nums">{formatSaudiMobile(address.phone)}</p>
            </address>
            {confirmingDelete === address.id ? (
              <div
                className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-sm"
                role="group"
                aria-label={t.confirmDelete}
              >
                <p className="w-full text-text">{t.confirmDelete}</p>
                <Button
                  variant="danger"
                  size="sm"
                  loading={busyId === address.id}
                  onClick={() =>
                    void mutate(
                      address.id,
                      () =>
                        apiRequest(`/api/account/addresses/${address.id}`, {
                          method: 'DELETE',
                          locale,
                        }),
                      t.deleted,
                    )
                  }
                >
                  {t.delete}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(null)}>
                  {t.cancel}
                </Button>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 text-sm">
                <button
                  type="button"
                  className="underline-offset-4 hover:underline"
                  onClick={() => setMode({ kind: 'edit', id: address.id })}
                >
                  {t.edit}
                </button>
                {address.isDefault ? null : (
                  <button
                    type="button"
                    className="underline-offset-4 hover:underline disabled:opacity-50"
                    disabled={busyId === address.id}
                    onClick={() =>
                      void mutate(address.id, () =>
                        apiRequest(`/api/account/addresses/${address.id}/default`, {
                          method: 'POST',
                          locale,
                        }),
                      )
                    }
                  >
                    {t.makeDefault}
                  </button>
                )}
                <button
                  type="button"
                  className="text-danger underline-offset-4 hover:underline"
                  onClick={() => setConfirmingDelete(address.id)}
                >
                  {t.delete}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {addresses.length < maxAddresses ? (
        <Button variant="secondary" onClick={() => setMode({ kind: 'add' })}>
          {t.add}
        </Button>
      ) : null}
    </div>
  )
}
