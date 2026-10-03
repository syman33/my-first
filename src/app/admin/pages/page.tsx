import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { AdminPageHeader, Badge, DataTable, Td, Th } from '@/components/admin/ui'
import { getDictionary } from '@/i18n'
import { formatDateTime } from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { listPages } from '@/services/admin/content.service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.pages.title }
}

export default async function AdminPagesPage() {
  const access = await adminAccess('CONTENT_MANAGE', '/admin/pages')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict } = access
  const t = dict.admin.pages
  const pages = await listPages()
  return (
    <div>
      <AdminPageHeader title={t.title} description={t.description} />
      <DataTable
        caption={t.title}
        isEmpty={pages.length === 0}
        empty={dict.admin.table.empty}
        head={
          <tr>
            <Th>{t.columns.page}</Th>
            <Th>{t.columns.status}</Th>
            <Th>{t.columns.updated}</Th>
            <Th>
              <span className="sr-only">{dict.admin.table.actions}</span>
            </Th>
          </tr>
        }
      >
        {pages.map((page) => (
          <tr key={page.id} className="hover:bg-ivory/50">
            <Td>
              <Link
                href={`/admin/pages/${page.slug}` as Route}
                className="font-medium text-ink hover:underline"
              >
                {locale === 'ar' ? page.titleAr : page.titleEn}
              </Link>
              <p className="text-xs text-muted" dir="ltr">
                /{page.slug}
              </p>
            </Td>
            <Td>
              <Badge tone={page.isPublished ? 'success' : 'neutral'}>
                {page.isPublished ? t.published : t.hidden}
              </Badge>
            </Td>
            <Td className="whitespace-nowrap text-muted">
              {formatDateTime(page.updatedAt, locale)}
              {page.updatedBy ? <p className="text-xs">{page.updatedBy.name}</p> : null}
            </Td>
            <Td className="text-end whitespace-nowrap">
              <Link
                href={`/admin/pages/${page.slug}` as Route}
                className="text-sm text-ink underline-offset-4 hover:underline"
              >
                {t.edit}
              </Link>
              {page.isPublished ? (
                <a
                  href={`/${locale}/${page.slug}`}
                  target="_blank"
                  rel="noopener"
                  className="ms-4 text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
                >
                  {t.view}
                </a>
              ) : null}
            </Td>
          </tr>
        ))}
      </DataTable>
    </div>
  )
}
