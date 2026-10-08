import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { FilterBar, FilterDate, FilterSelect } from '@/components/admin/filter-bar'
import { AdminPageHeader, Badge, DataTable, Td, Th } from '@/components/admin/ui'
import { Alert } from '@/components/ui/alert'
import { getDictionary, interpolate } from '@/i18n'
import { formatDateTime } from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import {
  ADMIN_PAGE_SIZE,
  dateParam,
  enumParam,
  firstParam,
  pageParam,
  searchParam,
} from '@/lib/admin/params'
import { uuidField } from '@/schemas/common'
import { AUDIT_ENTITY_TYPES, auditEntityHref, listAuditLogs } from '@/services/admin/logs.service'
import { addDays } from '@/utils/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.audit.title }
}

const ACTOR_TYPES = ['ADMIN', 'STAFF', 'CUSTOMER', 'SYSTEM'] as const

export default async function AdminAuditPage({ searchParams }: PageProps<'/admin/audit'>) {
  const access = await adminAccess('AUDIT_LOG_VIEW', '/admin/audit')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict } = access
  const t = dict.admin.audit
  const params = await searchParams
  const actor = uuidField.safeParse(firstParam(params, 'actor'))
  const to = dateParam(params, 'to')
  const filters = {
    q: searchParam(params),
    actorType: enumParam(params, 'actorType', ACTOR_TYPES),
    entityType: enumParam(params, 'entityType', AUDIT_ENTITY_TYPES),
    actorId: actor.success ? actor.data : undefined,
    from: dateParam(params, 'from'),
    to: to ? addDays(to, 1) : undefined,
  }
  const page = pageParam(params)
  const { rows, total, users } = await listAuditLogs(filters, page, ADMIN_PAGE_SIZE)
  const hasFilters = Object.values(filters).some((value) => value !== undefined)
  const actorName = filters.actorId
    ? (rows.find((row) => row.actorId === filters.actorId)?.actor?.name ?? filters.actorId)
    : null

  return (
    <div>
      <AdminPageHeader title={t.title} description={t.description} />
      {actorName ? (
        <Alert tone="info">
          {interpolate(t.onlyActor, { name: actorName })}{' '}
          <Link href="/admin/audit" className="underline underline-offset-4">
            {t.showAll}
          </Link>
        </Alert>
      ) : null}
      <FilterBar
        action="/admin/audit"
        t={dict.admin.table}
        query={filters.q}
        searchPlaceholder={t.searchPlaceholder}
        hasFilters={hasFilters}
      >
        {filters.actorId ? <input type="hidden" name="actor" value={filters.actorId} /> : null}
        <FilterSelect
          label={t.filters.actorType}
          name="actorType"
          value={filters.actorType}
          allLabel={dict.admin.table.all}
          options={ACTOR_TYPES.map((type) => ({ value: type, label: t.actorTypes[type] }))}
        />
        <FilterSelect
          label={t.filters.entityType}
          name="entityType"
          value={filters.entityType}
          allLabel={dict.admin.table.all}
          options={AUDIT_ENTITY_TYPES.map((type) => ({ value: type, label: t.entityTypes[type] }))}
        />
        <FilterDate label={dict.admin.table.from} name="from" value={firstParam(params, 'from')} />
        <FilterDate label={dict.admin.table.to} name="to" value={firstParam(params, 'to')} />
      </FilterBar>
      <DataTable
        caption={t.title}
        isEmpty={rows.length === 0}
        empty={hasFilters ? dict.admin.table.emptyFiltered : dict.admin.table.empty}
        head={
          <tr>
            <Th>{t.columns.time}</Th>
            <Th>{t.columns.actor}</Th>
            <Th>{t.columns.action}</Th>
            <Th>{t.columns.entity}</Th>
          </tr>
        }
      >
        {rows.map((row) => {
          const entityLabel =
            (t.entityTypes as Record<string, string>)[row.entityType] ?? row.entityType
          const user = row.entityId ? users.get(row.entityId) : undefined
          const href = auditEntityHref(row.entityType, row.entityId, user?.role)
          const metadata =
            row.metadata && typeof row.metadata === 'object' && Object.keys(row.metadata).length > 0
              ? JSON.stringify(row.metadata, null, 2)
              : null
          return (
            <tr key={row.id} className="align-top" data-testid="audit-row">
              <Td className="whitespace-nowrap text-muted">
                {formatDateTime(row.createdAt, locale)}
              </Td>
              <Td>
                {row.actor ? (
                  <>
                    <Link
                      href={`/admin/audit?actor=${row.actor.id}` as Route}
                      className="text-ink hover:underline"
                    >
                      {row.actor.name}
                    </Link>
                    <p className="text-xs text-muted" dir="ltr">
                      {row.actor.email}
                    </p>
                  </>
                ) : (
                  <span className="text-ink">{t.system}</span>
                )}
                <Badge tone="neutral" className="mt-1">
                  {t.actorTypes[row.actorType]}
                </Badge>
              </Td>
              <Td className="min-w-64">
                <code dir="ltr" className="text-xs text-ink">
                  {row.action}
                </code>
                <details className="mt-2 text-xs text-muted">
                  <summary className="cursor-pointer select-none">{t.details}</summary>
                  {metadata ? (
                    <pre
                      dir="ltr"
                      className="mt-2 max-h-72 max-w-xl overflow-auto bg-ivory p-3 text-start text-[11px] leading-5 whitespace-pre-wrap text-text"
                    >
                      {metadata}
                    </pre>
                  ) : (
                    <p className="mt-2">{t.noDetails}</p>
                  )}
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    {row.ipAddress ? (
                      <>
                        <dt>{t.ip}</dt>
                        <dd dir="ltr" className="text-start">
                          {row.ipAddress}
                        </dd>
                      </>
                    ) : null}
                    {row.requestId ? (
                      <>
                        <dt>{t.requestId}</dt>
                        <dd dir="ltr" className="text-start">
                          {row.requestId}
                        </dd>
                      </>
                    ) : null}
                  </dl>
                </details>
              </Td>
              <Td>
                <p className="text-ink">
                  {href ? (
                    <Link href={href as Route} className="hover:underline">
                      {user?.name ?? entityLabel}
                    </Link>
                  ) : (
                    entityLabel
                  )}
                </p>
                {row.entityId ? (
                  <p className="text-xs text-muted" dir="ltr" title={row.entityId}>
                    {row.entityType === 'settings' ? row.entityId : row.entityId.slice(0, 8)}
                  </p>
                ) : null}
              </Td>
            </tr>
          )
        })}
      </DataTable>
      <AdminPagination
        locale={locale}
        t={dict.admin.table}
        pathname="/admin/audit"
        params={params}
        page={page}
        pageSize={ADMIN_PAGE_SIZE}
        total={total}
      />
    </div>
  )
}
