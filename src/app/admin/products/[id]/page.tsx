import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import type { Route } from 'next'
import { notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { ImagesManager } from '@/components/admin/catalog/images-manager'
import { ProductForm } from '@/components/admin/catalog/product-form'
import { VariantsManager } from '@/components/admin/catalog/variants-manager'
import { DeleteButton } from '@/components/admin/delete-button'
import { AdminPageHeader, Badge, Card } from '@/components/admin/ui'
import { Alert } from '@/components/ui/alert'
import { buttonClasses } from '@/components/ui/button'
import { getDictionary, interpolate } from '@/i18n'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { firstParam } from '@/lib/admin/params'
import { hasPermission } from '@/lib/auth/permissions'
import { isAppError } from '@/lib/errors'
import { uuidField } from '@/schemas/common'
import { getAdminProduct, getCatalogOptions } from '@/services/admin/products.service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.products.title }
}

const STATUS_TONE = { DRAFT: 'warning', PUBLISHED: 'success', ARCHIVED: 'neutral' } as const

export default async function EditProductPage({
  params,
  searchParams,
}: PageProps<'/admin/products/[id]'>) {
  const { id } = await params
  const access = await adminAccess('PRODUCTS_VIEW', `/admin/products/${id}`)
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const parsed = uuidField.safeParse(id)
  if (!parsed.success) notFound()
  let product
  try {
    product = await getAdminProduct(parsed.data)
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound()
    throw error
  }
  const { locale, dict, session } = access
  const t = dict.admin.products
  const user = session.user
  const canManage = hasPermission(user, 'PRODUCTS_MANAGE')
  const options = await getCatalogOptions()
  const justCreated = firstParam(await searchParams, 'created') === '1'
  const name = locale === 'ar' ? product.nameAr : product.nameEn

  return (
    <div className="space-y-6">
      <AdminPageHeader
        locale={locale}
        back={{ href: '/admin/products', label: t.back }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {interpolate(t.editTitle, { name })}
            <Badge tone={STATUS_TONE[product.status]}>{t.statuses[product.status]}</Badge>
          </span>
        }
        description={<span className="ltr-nums">{product.sku}</span>}
        actions={
          product.status === 'PUBLISHED' ? (
            <Link
              href={
                `/${locale}/product/${encodeURIComponent(locale === 'ar' ? product.slugAr : product.slugEn)}` as Route
              }
              className={buttonClasses('subtle', 'sm')}
              target="_blank"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {t.viewInStore}
            </Link>
          ) : null
        }
      />
      {justCreated ? <Alert tone="success">{t.created}</Alert> : null}

      <Card title={t.sections.images}>
        {canManage ? (
          <ImagesManager
            locale={locale}
            productId={product.id}
            images={product.images}
            t={t.images}
            genericError={dict.errors.generic}
          />
        ) : product.images.length === 0 ? (
          <p className="text-sm text-muted">{t.images.empty}</p>
        ) : (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {product.images.map((image) => (
              <li key={image.id} className="relative aspect-[4/5] bg-sand">
                <Image
                  src={image.url}
                  alt={(locale === 'ar' ? image.altAr : image.altEn) ?? ''}
                  fill
                  sizes="120px"
                  className="object-cover"
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t.sections.variants}>
        <VariantsManager
          locale={locale}
          productId={product.id}
          variants={product.variants}
          images={product.images}
          canManage={canManage}
          canAdjustStock={hasPermission(user, 'INVENTORY_ADJUST')}
          t={t}
          formLabels={dict.admin.form}
          colorLabels={dict.store.colors}
          fieldMessages={dict.errors.fields}
          genericError={dict.errors.generic}
        />
      </Card>

      {canManage ? (
        <ProductForm
          locale={locale}
          product={product}
          categories={options.categories}
          brands={options.brands}
          t={t}
          formLabels={dict.admin.form}
          colorLabels={dict.store.colors}
          fieldMessages={dict.errors.fields}
          genericError={dict.errors.generic}
        />
      ) : null}

      <Card title={t.sections.danger}>
        {product.hasOrders || !hasPermission(user, 'PRODUCTS_DELETE') ? (
          <p className="text-sm text-muted">{t.archiveHint}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">{t.deleteHint}</p>
            <DeleteButton
              locale={locale}
              endpoint={`/api/admin/products/${product.id}`}
              label={t.delete}
              confirmText={t.deleteConfirm}
              yesLabel={dict.admin.form.yes}
              noLabel={dict.admin.form.no}
              redirectTo="/admin/products"
              reasons={{ HAS_ORDERS: t.archiveHint }}
              genericError={dict.errors.generic}
            />
          </div>
        )}
      </Card>
    </div>
  )
}
