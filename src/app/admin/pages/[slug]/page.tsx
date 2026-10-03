import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { PageEditor } from '@/components/admin/content/page-editor'
import { AdminPageHeader } from '@/components/admin/ui'
import { buttonClasses } from '@/components/ui/button'
import { getDictionary } from '@/i18n'
import { formatDateTime } from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { isAppError } from '@/lib/errors'
import { getPageForEdit } from '@/services/admin/content.service'
import { getPageTokenValues } from '@/services/content/page.service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.pages.title }
}

export default async function AdminPageEditPage({ params }: PageProps<'/admin/pages/[slug]'>) {
  const { slug } = await params
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound()
  const access = await adminAccess('CONTENT_MANAGE', `/admin/pages/${slug}`)
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict } = access
  const t = dict.admin.pages
  let page
  try {
    page = await getPageForEdit(slug)
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound()
    throw error
  }
  const [ar, en] = await Promise.all([getPageTokenValues('ar'), getPageTokenValues('en')])

  return (
    <div>
      <AdminPageHeader
        locale={locale}
        back={{ href: '/admin/pages', label: t.back }}
        title={locale === 'ar' ? page.titleAr : page.titleEn}
        description={
          <>
            <span dir="ltr">/{page.slug}</span> · {formatDateTime(page.updatedAt, locale)}
          </>
        }
        actions={
          page.isPublished ? (
            <a
              href={`/${locale}/${page.slug}`}
              target="_blank"
              rel="noopener"
              className={buttonClasses('secondary', 'sm')}
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {t.view}
            </a>
          ) : null
        }
      />
      <PageEditor
        locale={locale}
        slug={page.slug}
        initial={{
          titleAr: page.titleAr,
          titleEn: page.titleEn,
          contentAr: page.contentAr,
          contentEn: page.contentEn,
          seoTitleAr: page.seoTitleAr ?? '',
          seoTitleEn: page.seoTitleEn ?? '',
          seoDescriptionAr: page.seoDescriptionAr ?? '',
          seoDescriptionEn: page.seoDescriptionEn ?? '',
          isPublished: page.isPublished,
        }}
        tokenValues={{ ar, en }}
        t={t}
        formLabels={dict.admin.form}
        fieldMessages={dict.errors.fields}
        genericError={dict.errors.generic}
      />
    </div>
  )
}
