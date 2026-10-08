import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { FilterBar, FilterSelect } from '@/components/admin/filter-bar'
import { AdminPageHeader, Badge, DataTable, Td, Th } from '@/components/admin/ui'
import { getDictionary } from '@/i18n'
import { formatDateTime } from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { ADMIN_PAGE_SIZE, enumParam, pageParam, searchParam } from '@/lib/admin/params'
import { listMessages } from '@/services/admin/customers.service'
import { cn } from '@/utils/cn'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.messages.title }
}

const STATUSES = ['NEW', 'READ', 'ARCHIVED'] as const
const TONE = { NEW: 'warning', READ: 'neutral', ARCHIVED: 'neutral' } as const

export default async function AdminMessagesPage({ searchParams }: PageProps<'/admin/messages'>) {
  const access = await adminAccess('MESSAGES_VIEW', '/admin/messages')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict } = access
  const t = dict.admin.messages
  const params = await searchParams
  const filters = { q: searchParam(params), status: enumParam(params, 'status', STATUSES) }
  const page = pageParam(params)
  const { rows, total } = await listMessages(filters, page, ADMIN_PAGE_SIZE)
  const hasFilters = Boolean(filters.q || filters.status)

  return (
    <div>
      <AdminPageHeader title={t.title} description={t.description} />
      <FilterBar
        action="/admin/messages"
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
            <Th>{t.columns.from}</Th>
            <Th>{t.columns.subject}</Th>
            <Th>{t.columns.status}</Th>
            <Th>{t.columns.date}</Th>
          </tr>
        }
      >
        {rows.map((message) => (
          <tr key={message.id} className="hover:bg-ivory/50">
            <Td>
              <p className={cn('text-ink', message.status === 'NEW' && 'font-medium')}>
                {message.name}
              </p>
              <p className="text-xs text-muted">{message.email}</p>
            </Td>
            <Td>
              <Link
                href={`/admin/messages/${message.id}` as Route}
                className={cn(
                  'hover:underline',
                  message.status === 'NEW' ? 'font-medium text-ink' : 'text-text',
                )}
                dir="auto"
              >
                {message.subject}
              </Link>
            </Td>
            <Td>
              <Badge tone={TONE[message.status]}>{t.statuses[message.status]}</Badge>
            </Td>
            <Td className="whitespace-nowrap text-muted">
              {formatDateTime(message.createdAt, locale)}
            </Td>
          </tr>
        ))}
      </DataTable>
      <AdminPagination
        locale={locale}
        t={dict.admin.table}
        pathname="/admin/messages"
        params={params}
        page={page}
        pageSize={ADMIN_PAGE_SIZE}
        total={total}
      />
    </div>
  )
}
