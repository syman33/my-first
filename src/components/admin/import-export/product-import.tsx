'use client'

import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { controlClasses } from '@/components/ui/field'
import type { Dictionary } from '@/i18n'
import { interpolate } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { formatNumber } from '@/i18n/format'
import type { ImportIssue } from '@/lib/admin/catalog-csv'
import { ApiClientError, apiUpload } from '@/lib/client/api'
import { cn } from '@/utils/cn'

/** Mirrors the server's import report (see catalog-import.service). */
interface ImportReport {
  ok: boolean
  applied: boolean
  problem: 'ENCODING' | 'EMPTY' | 'TOO_MANY_ROWS' | 'MISSING_COLUMNS' | 'MALFORMED' | null
  missingColumns: string[]
  ignoredColumns: string[]
  issues: ImportIssue[]
  issueCount: number
  summary: {
    rows: number
    productsCreated: number
    productsUpdated: number
    variantsCreated: number
    variantsUpdated: number
    stockChanges: number
    unchangedRows: number
  }
}

type Stage = 'idle' | 'checking' | 'checked' | 'applying' | 'applied'

export function ProductImport({
  locale,
  t,
  genericError,
}: {
  locale: Locale
  t: Dictionary['admin']['importExport']['products']
  genericError: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const inputId = useId()
  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState<Stage>('idle')
  const [report, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function send(mode: 'check' | 'apply') {
    if (!file) {
      setError(t.chooseFile)
      return
    }
    setError(null)
    setStage(mode === 'check' ? 'checking' : 'applying')
    const form = new FormData()
    form.set('file', file)
    form.set('mode', mode)
    try {
      const result = await apiUpload<{ report: ImportReport }>('/api/admin/import/products', form, {
        locale,
      })
      setReport(result.report)
      setStage(result.report.applied ? 'applied' : 'checked')
      if (result.report.applied) startTransition(() => router.refresh())
    } catch (caught) {
      const rejected =
        caught instanceof ApiClientError
          ? (caught.details.report as ImportReport | undefined)
          : undefined
      if (rejected) {
        // The data changed since the check: show the fresh problems, nothing was applied.
        setReport(rejected)
        setStage('checked')
      } else {
        setError(caught instanceof ApiClientError ? caught.message : genericError)
        setStage(report ? 'checked' : 'idle')
      }
    }
  }

  const summary = report?.summary
  const changes = summary
    ? summary.productsCreated +
      summary.productsUpdated +
      summary.variantsCreated +
      summary.variantsUpdated +
      summary.stockChanges
    : 0
  const busy = stage === 'checking' || stage === 'applying'

  return (
    <div className="space-y-5" data-testid="product-import">
      <div className="space-y-2">
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          {t.file}
        </label>
        <input
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null)
            setReport(null)
            setStage('idle')
            setError(null)
          }}
          className={cn(
            controlClasses,
            'h-auto py-2 text-sm file:me-3 file:border-0 file:bg-sand file:px-3 file:py-1.5',
          )}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void send('check')}
          loading={stage === 'checking'}
          loadingLabel={t.checking}
          disabled={busy || !file}
          data-testid="import-check"
        >
          {t.check}
        </Button>
        <Button
          size="sm"
          onClick={() => void send('apply')}
          loading={stage === 'applying'}
          loadingLabel={t.applying}
          disabled={busy || stage !== 'checked' || !report?.ok || changes === 0}
          data-testid="import-apply"
        >
          {t.apply}
        </Button>
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}

      {report ? (
        <div className="space-y-4" aria-live="polite">
          {report.problem ? (
            <Alert tone="error">
              {interpolate(t.problems[report.problem], {
                columns: report.missingColumns.join(', '),
              })}
            </Alert>
          ) : report.applied ? (
            <Alert tone="success">{t.applied}</Alert>
          ) : report.ok ? (
            <Alert tone={changes > 0 ? 'info' : 'success'}>
              {changes > 0 ? t.ready : t.nothingToDo}
            </Alert>
          ) : (
            <Alert tone="error">
              {interpolate(t.hasIssues, { count: formatNumber(report.issueCount, locale) })}
            </Alert>
          )}

          {summary && !report.problem ? (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="import-summary">
              {(Object.keys(t.summary) as (keyof typeof t.summary)[]).map((key) => (
                <div key={key} className="border border-line bg-paper px-3 py-2">
                  <dt className="text-xs text-muted">{t.summary[key]}</dt>
                  <dd className="mt-1 text-lg text-ink tabular-nums">
                    {formatNumber(summary[key], locale)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {report.ignoredColumns.length > 0 ? (
            <p className="text-xs text-muted">
              {interpolate(t.ignored, { columns: report.ignoredColumns.join(', ') })}
            </p>
          ) : null}

          {report.issues.length > 0 ? (
            <div className="overflow-x-auto border border-line bg-paper">
              <table className="w-full min-w-[32rem] text-sm" data-testid="import-issues">
                <thead className="border-b border-line bg-ivory/60 text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-start font-medium">
                      {t.issueColumns.row}
                    </th>
                    <th scope="col" className="px-4 py-2 text-start font-medium">
                      {t.issueColumns.column}
                    </th>
                    <th scope="col" className="px-4 py-2 text-start font-medium">
                      {t.issueColumns.problem}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {report.issues.map((issue, index) => (
                    <tr key={`${issue.row}-${issue.column ?? ''}-${index}`}>
                      <td className="px-4 py-2 tabular-nums">{formatNumber(issue.row, locale)}</td>
                      <td className="px-4 py-2">
                        {issue.column ? <code dir="ltr">{issue.column}</code> : '—'}
                      </td>
                      <td className="px-4 py-2 text-text">{t.issues[issue.code]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.issueCount > report.issues.length ? (
                <p className="border-t border-line px-4 py-2 text-xs text-muted">
                  {interpolate(t.moreIssues, {
                    shown: formatNumber(report.issues.length, locale),
                    count: formatNumber(report.issueCount, locale),
                  })}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
