import type { Metadata } from 'next'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { ProductForm } from '@/components/admin/catalog/product-form'
import { AdminPageHeader } from '@/components/admin/ui'
import { getDictionary } from '@/i18n'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { getCatalogOptions } from '@/services/admin/products.service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.products.newTitle }
}

export default async function NewProductPage() {
  const access = await adminAccess('PRODUCTS_MANAGE', '/admin/products/new')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict } = access
  const t = dict.admin.products
  const options = await getCatalogOptions()
  return (
    <div>
      <AdminPageHeader
        locale={locale}
        back={{ href: '/admin/products', label: t.back }}
        title={t.newTitle}
      />
      <ProductForm
        locale={locale}
        product={null}
        categories={options.categories}
        brands={options.brands}
        t={t}
        formLabels={dict.admin.form}
        colorLabels={dict.store.colors}
        fieldMessages={dict.errors.fields}
        genericError={dict.errors.generic}
      />
    </div>
  )
}
