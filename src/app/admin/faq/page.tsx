import type { Metadata } from 'next'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { FaqEditor } from '@/components/admin/content/faq-editor'
import { AdminPageHeader } from '@/components/admin/ui'
import { getDictionary } from '@/i18n'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { listFaq } from '@/services/admin/content.service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.faq.title }
}

export default async function AdminFaqPage() {
  const access = await adminAccess('CONTENT_MANAGE', '/admin/faq')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict } = access
  const items = (await listFaq()).map((item) => ({
    id: item.id,
    questionAr: item.questionAr,
    questionEn: item.questionEn,
    answerAr: item.answerAr,
    answerEn: item.answerEn,
    sortOrder: item.sortOrder,
    isPublished: item.isPublished,
  }))
  return (
    <div>
      <AdminPageHeader title={dict.admin.faq.title} description={dict.admin.faq.description} />
      <FaqEditor
        locale={locale}
        items={items}
        t={dict.admin.faq}
        tokensLabel={dict.admin.pages.tokens}
        emptyLabel={dict.admin.table.empty}
        formLabels={dict.admin.form}
        fieldMessages={dict.errors.fields}
        genericError={dict.errors.generic}
      />
    </div>
  )
}
