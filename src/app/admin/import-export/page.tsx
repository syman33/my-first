import type { Metadata } from 'next'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { DownloadButton } from '@/components/admin/import-export/download-button'
import { OrderExportForm } from '@/components/admin/import-export/order-export-form'
import { ProductImport } from '@/components/admin/import-export/product-import'
import { AdminPageHeader, Card } from '@/components/admin/ui'
import { getDictionary } from '@/i18n'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { EXPORT_ONLY_COLUMNS, IMPORT_COLUMNS } from '@/lib/admin/catalog-csv'
import { hasPermission } from '@/lib/auth/permissions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.importExport.title }
}

export default async function AdminImportExportPage() {
  const access = await adminAccess('IMPORT_EXPORT', '/admin/import-export')
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const { locale, dict, session } = access
  const t = dict.admin.importExport
  const user = session.user
  const can = {
    exportProducts: hasPermission(user, 'PRODUCTS_VIEW'),
    importProducts:
      hasPermission(user, 'PRODUCTS_MANAGE') && hasPermission(user, 'INVENTORY_ADJUST'),
    exportOrders: hasPermission(user, 'ORDERS_VIEW'),
  }
  const download = {
    locale,
    label: t.download,
    busyLabel: t.downloading,
    genericError: dict.errors.generic,
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t.title} description={t.description} />
      <p className="text-xs text-muted">{t.audited}</p>
      <div className="grid gap-6 lg:grid-cols-2">
        {can.exportProducts ? (
          <Card title={t.products.exportTitle}>
            <p className="mb-4 text-sm text-text">{t.products.exportBody}</p>
            <DownloadButton
              {...download}
              href="/api/admin/export/products"
              fallbackName="velora-products.csv"
              testId="export-products"
            />
          </Card>
        ) : null}
        {can.exportOrders ? (
          <Card title={t.orders.title}>
            <p className="mb-4 text-sm text-text">{t.orders.body}</p>
            <OrderExportForm
              locale={locale}
              t={t}
              table={dict.admin.table}
              statusLabels={dict.orders.status}
              genericError={dict.errors.generic}
            />
          </Card>
        ) : null}
        <Card title={t.newsletter.title}>
          <p className="mb-4 text-sm text-text">{t.newsletter.body}</p>
          <DownloadButton
            {...download}
            href="/api/admin/newsletter/export"
            fallbackName="velora-newsletter.csv"
          />
        </Card>
      </div>

      {can.importProducts ? (
        <Card title={t.products.importTitle}>
          <div className="space-y-6">
            <p className="text-sm text-text">{t.products.importBody}</p>
            <ProductImport locale={locale} t={t.products} genericError={dict.errors.generic} />
            <details className="border-t border-line pt-4">
              <summary className="cursor-pointer text-sm font-medium text-ink select-none">
                {t.products.guideTitle}
              </summary>
              <p className="mt-3 text-sm leading-7 text-muted">{t.products.rules}</p>
              <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(12rem,auto)_1fr]">
                {[...IMPORT_COLUMNS, ...EXPORT_ONLY_COLUMNS].map((column) => (
                  <div key={column} className="contents">
                    <dt>
                      <code dir="ltr" className="text-xs text-ink">
                        {column}
                      </code>
                    </dt>
                    <dd className="text-text">{t.products.columns[column]}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
