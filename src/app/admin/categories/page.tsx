import type { Metadata } from 'next'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { CategoryEditor } from '@/components/admin/catalog/category-editor'
import { AdminPageHeader } from '@/components/admin/ui'
import { getDictionary } from '@/i18n'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { listCategoriesForAdmin } from '@/services/admin/categories.service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.categories.title }
}

export default async function AdminCategoriesPage() {
  const access = await adminAccess('CATALOG_MANAGE', '/admin/categories')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict } = access
  const t = dict.admin.categories
  const categories = await listCategoriesForAdmin()
  return (
    <div>
      <AdminPageHeader title={t.title} description={t.description} />
      <CategoryEditor
        locale={locale}
        categories={categories.map(({ _count, createdAt: _c, updatedAt: _u, ...category }) => ({
          ...category,
          productCount: _count.products,
        }))}
        t={t}
        genders={dict.admin.products.fields.genders}
        formLabels={dict.admin.form}
        generateLabel={dict.admin.products.fields.generate}
        fieldMessages={dict.errors.fields}
        genericError={dict.errors.generic}
      />
    </div>
  )
}
