import type { Metadata } from 'next'
import { Download } from 'lucide-react'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { FilterBar, FilterSelect } from '@/components/admin/filter-bar'
import { PostAction } from '@/components/admin/post-action'
import { AdminPageHeader, Badge, DataTable, Td, Th } from '@/components/admin/ui'
import { buttonClasses } from '@/components/ui/button'
import { getDictionary } from '@/i18n'
import { formatDate } from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { ADMIN_PAGE_SIZE, enumParam, pageParam, searchParam } from '@/lib/admin/params'
import { hasPermission } from '@/lib/auth/permissions'
import { listSubscribers } from '@/services/admin/customers.service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.newsletter.title }
}

const STATUSES = ['SUBSCRIBED', 'UNSUBSCRIBED'] as const

export default async function AdminNewsletterPage({
  searchParams,
}: PageProps<'/admin/newsletter'>) {
  const access = await adminAccess('NEWSLETTER_VIEW', '/admin/newsletter')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict, session } = access
  const t = dict.admin.newsletter
  const params = await searchParams
  const filters = { q: searchParam(params), status: enumParam(params, 'status', STATUSES) }
  const page = pageParam(params)
  const { rows, total } = await listSubscribers(filters, page, ADMIN_PAGE_SIZE)
  const hasFilters = Boolean(filters.q || filters.status)

  return (
    <div>
      <AdminPageHeader
        title={t.title}
        description={t.description}
        actions={
          hasPermission(session.user, 'IMPORT_EXPORT') ? (
            // A plain link: the browser downloads the CSV with the session cookie.
            <a
              href="/api/admin/newsletter/export"
              className={buttonClasses('subtle', 'sm')}
              download
            >
              <Download className="size-4" aria-hidden="true" />
              {t.export}
            </a>
          ) : null
        }
      />
      <FilterBar
        action="/admin/newsletter"
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
      </FilterBar>
      <DataTable
        caption={t.title}
        isEmpty={rows.length === 0}
        empty={hasFilters ? dict.admin.table.emptyFiltered : dict.admin.table.empty}
        head={
          <tr>
            <Th>{t.columns.email}</Th>
            <Th>{t.columns.language}</Th>
            <Th>{t.columns.source}</Th>
            <Th>{t.columns.since}</Th>
            <Th>{t.columns.status}</Th>
            <Th>{dict.admin.table.actions}</Th>
          </tr>
        }
      >
        {rows.map((subscriber) => (
          <tr key={subscriber.id}>
            <Td className="text-ink">{subscriber.email}</Td>
            <Td className="text-muted">{subscriber.locale === 'ar' ? 'العربية' : 'English'}</Td>
            <Td className="text-muted">{subscriber.source ?? '—'}</Td>
            <Td className="whitespace-nowrap text-muted">
              {formatDate(subscriber.subscribedAt, locale)}
            </Td>
            <Td>
              <Badge tone={subscriber.status === 'SUBSCRIBED' ? 'success' : 'neutral'}>
                {t.statuses[subscriber.status]}
              </Badge>
            </Td>
            <Td>
              {subscriber.status === 'SUBSCRIBED' ? (
                <PostAction
                  locale={locale}
                  endpoint={`/api/admin/newsletter/${subscriber.id}/unsubscribe`}
                  label={t.unsubscribe}
                  variant="ghost"
                  confirmText={t.unsubscribeConfirm}
                  confirmYes={dict.admin.form.yes}
                  cancelLabel={dict.admin.form.no}
                  genericError={dict.errors.generic}
                />
              ) : null}
            </Td>
          </tr>
        ))}
      </DataTable>
      <AdminPagination
        locale={locale}
        t={dict.admin.table}
        pathname="/admin/newsletter"
        params={params}
        page={page}
        pageSize={ADMIN_PAGE_SIZE}
        total={total}
      />
    </div>
  )
}
