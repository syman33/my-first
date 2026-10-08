import type { Metadata } from 'next'
import Link from 'next/link'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { FilterBar, FilterSelect } from '@/components/admin/filter-bar'
import { PostAction } from '@/components/admin/post-action'
import { AdminPageHeader, Badge, DataTable, Td, Th } from '@/components/admin/ui'
import { Alert } from '@/components/ui/alert'
import { getDictionary, interpolate } from '@/i18n'
import { formatDateTime, formatNumber } from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { ADMIN_PAGE_SIZE, enumParam, pageParam, searchParam } from '@/lib/admin/params'
import type { BadgeTone } from '@/lib/admin/status-tones'
import { listNotifications } from '@/services/admin/logs.service'
import { getIntegrationStatus } from '@/services/admin/system.service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.notifications.title }
}

const STATUSES = ['PENDING', 'SENT', 'FAILED', 'SKIPPED'] as const
const CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP'] as const
const STATUS_TONES: Record<(typeof STATUSES)[number], BadgeTone> = {
  PENDING: 'warning',
  SENT: 'success',
  FAILED: 'danger',
  SKIPPED: 'neutral',
}

export default async function AdminNotificationsPage({
  searchParams,
}: PageProps<'/admin/notifications'>) {
  const access = await adminAccess('NOTIFICATIONS_VIEW', '/admin/notifications')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict } = access
  const t = dict.admin.notifications
  const params = await searchParams
  const filters = {
    q: searchParam(params),
    status: enumParam(params, 'status', STATUSES),
    channel: enumParam(params, 'channel', CHANNELS),
  }
  const page = pageParam(params)
  const { rows, total, failed } = await listNotifications(filters, page, ADMIN_PAGE_SIZE)
  const hasFilters = Boolean(filters.q || filters.status || filters.channel)
  const emailSimulated =
    getIntegrationStatus().find((integration) => integration.key === 'email')?.state !== 'live'

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t.title} description={t.description} />
      {emailSimulated ? <Alert tone="warning">{t.simulatedEmail}</Alert> : null}
      {failed > 0 && filters.status !== 'FAILED' ? (
        <Alert tone="error">
          {interpolate(t.failedCount, { count: formatNumber(failed, locale) })}{' '}
          <Link href="/admin/notifications?status=FAILED" className="underline underline-offset-4">
            {t.showFailed}
          </Link>
        </Alert>
      ) : null}
      <FilterBar
        action="/admin/notifications"
        t={dict.admin.table}
        query={filters.q}
        searchPlaceholder={t.searchPlaceholder}
        hasFilters={hasFilters}
      >
        <FilterSelect
          label={t.columns.status}
          name="status"
          value={filters.status}
          allLabel={dict.admin.table.all}
          options={STATUSES.map((status) => ({ value: status, label: t.statuses[status] }))}
        />
        <FilterSelect
          label={t.columns.channel}
          name="channel"
          value={filters.channel}
          allLabel={dict.admin.table.all}
          options={CHANNELS.map((channel) => ({ value: channel, label: t.channels[channel] }))}
        />
      </FilterBar>
      <DataTable
        caption={t.title}
        isEmpty={rows.length === 0}
        empty={hasFilters ? dict.admin.table.emptyFiltered : dict.admin.table.empty}
        head={
          <tr>
            <Th>{t.columns.time}</Th>
            <Th>{t.columns.message}</Th>
            <Th>{t.columns.recipient}</Th>
            <Th>{t.columns.status}</Th>
            <Th className="text-end">{t.columns.attempts}</Th>
            <Th>
              <span className="sr-only">{dict.admin.table.actions}</span>
            </Th>
          </tr>
        }
      >
        {rows.map((row) => (
          <tr key={row.id} className="align-top" data-testid="notification-row">
            <Td className="whitespace-nowrap text-muted">
              {formatDateTime(row.createdAt, locale)}
            </Td>
            <Td>
              <p className="text-ink">
                {(t.templates as Record<string, string>)[row.template] ?? row.template}
              </p>
              <p className="text-xs text-muted">
                {t.channels[row.channel]} · <span dir="ltr">{row.provider}</span>
              </p>
              {row.subject ? (
                <p className="mt-1 max-w-sm text-xs text-muted" dir="auto">
                  {row.subject}
                </p>
              ) : null}
            </Td>
            <Td className="text-xs text-text">
              <span dir="ltr">{row.recipient}</span>
            </Td>
            <Td>
              <Badge tone={STATUS_TONES[row.status]}>{t.statuses[row.status]}</Badge>
              {row.sentAt ? (
                <p className="mt-1 text-xs whitespace-nowrap text-muted">
                  {t.sentAt}: {formatDateTime(row.sentAt, locale)}
                </p>
              ) : null}
              {row.error && row.status !== 'SENT' ? (
                <details className="mt-1 max-w-xs text-xs text-muted">
                  <summary className="cursor-pointer select-none">{t.error}</summary>
                  <p className="mt-1 break-words" dir="auto">
                    {row.error}
                  </p>
                </details>
              ) : null}
            </Td>
            <Td className="text-end tabular-nums">{formatNumber(row.attempts, locale)}</Td>
            <Td>
              {row.retry === 'RETRYABLE' ? (
                <PostAction
                  locale={locale}
                  endpoint={`/api/admin/notifications/${row.id}/retry`}
                  label={t.retry}
                  variant="subtle"
                  doneMessage={t.retried}
                  cancelLabel={dict.admin.form.cancel}
                  genericError={dict.errors.generic}
                />
              ) : row.retry === 'NOT_FAILED' ? null : (
                <p className="max-w-48 text-xs text-muted">{t.retryStates[row.retry]}</p>
              )}
            </Td>
          </tr>
        ))}
      </DataTable>
      <AdminPagination
        locale={locale}
        t={dict.admin.table}
        pathname="/admin/notifications"
        params={params}
        page={page}
        pageSize={ADMIN_PAGE_SIZE}
        total={total}
      />
    </div>
  )
}
