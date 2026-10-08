'use client'

import { useState } from 'react'
import { controlClasses } from '@/components/ui/field'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { cn } from '@/utils/cn'
import { DownloadButton } from './download-button'

const STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
] as const

export function OrderExportForm({
  locale,
  t,
  table,
  statusLabels,
  genericError,
}: {
  locale: Locale
  t: Dictionary['admin']['importExport']
  table: Dictionary['admin']['table']
  statusLabels: Dictionary['orders']['status']
  genericError: string
}) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState('')
  const query = new URLSearchParams()
  if (from) query.set('from', from)
  if (to) query.set('to', to)
  if (status) query.set('status', status)
  const search = query.toString()
  const href = `/api/admin/export/orders${search ? `?${search}` : ''}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-muted">
          <span>{table.from}</span>
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className={cn(controlClasses, 'h-10 text-sm')}
            dir="ltr"
          />
        </label>
        <label className="space-y-1 text-xs text-muted">
          <span>{table.to}</span>
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className={cn(controlClasses, 'h-10 text-sm')}
            dir="ltr"
          />
        </label>
        <label className="space-y-1 text-xs text-muted">
          <span>{t.orders.status}</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className={cn(controlClasses, 'h-10 min-w-40 pe-8 text-sm')}
          >
            <option value="">{table.all}</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <DownloadButton
        locale={locale}
        href={href}
        fallbackName="velora-orders.csv"
        label={t.download}
        busyLabel={t.downloading}
        genericError={genericError}
        describeError={(error) =>
          error.details.reason === 'TOO_MANY_ROWS' ? t.orders.tooMany : null
        }
        testId="export-orders"
      />
    </div>
  )
}
