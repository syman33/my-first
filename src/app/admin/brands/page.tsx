import type { Metadata } from 'next'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { BrandEditor } from '@/components/admin/catalog/brand-editor'
import { AdminPageHeader } from '@/components/admin/ui'
import { getDictionary } from '@/i18n'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { listBrandsForAdmin } from '@/services/admin/categories.service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.brands.title }
}

export default async function AdminBrandsPage() {
  const access = await adminAccess('CATALOG_MANAGE', '/admin/brands')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict } = access
  const t = dict.admin.brands
  const brands = await listBrandsForAdmin()
  return (
    <div>
      <AdminPageHeader title={t.title} description={t.description} />
      <BrandEditor
        locale={locale}
        brands={brands.map(({ _count, createdAt: _c, updatedAt: _u, ...brand }) => ({
          ...brand,
          productCount: _count.products,
        }))}
        t={t}
        activeLabels={{
          active: dict.admin.categories.active,
          inactive: dict.admin.categories.inactive,
        }}
        generateLabel={dict.admin.products.fields.generate}
        formLabels={dict.admin.form}
        fieldMessages={dict.errors.fields}
        genericError={dict.errors.generic}
      />
    </div>
  )
}
