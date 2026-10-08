'use client'

import { Download } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { Locale } from '@/i18n/config'
import { ApiClientError, apiDownload } from '@/lib/client/api'

/** Downloads a CSV export; failures show a readable message instead of a raw error page. */
export function DownloadButton({
  locale,
  href,
  fallbackName,
  label,
  busyLabel,
  genericError,
  describeError,
  testId,
}: {
  locale: Locale
  href: string
  fallbackName: string
  label: string
  busyLabel: string
  genericError: string
  /** Optional mapping of specific API errors to friendlier text. */
  describeError?: (error: ApiClientError) => string | null
  testId?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    setBusy(true)
    setError(null)
    try {
      await apiDownload(href, { locale, fallbackName })
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? (describeError?.(caught) ?? caught.message)
          : genericError,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void download()}
        loading={busy}
        loadingLabel={busyLabel}
        data-testid={testId}
      >
        <Download className="size-4" aria-hidden="true" />
        {label}
      </Button>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  )
}
