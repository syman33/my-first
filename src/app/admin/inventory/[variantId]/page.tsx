import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { notFound } from 'next/navigation'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { AdjustStockForm } from '@/components/admin/catalog/adjust-stock-form'
import { AdminPageHeader, Card, DataTable, DefinitionList, Td, Th } from '@/components/admin/ui'
import { getDictionary } from '@/i18n'
import { formatDateTime, formatNumber } from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { hasPermission } from '@/lib/auth/permissions'
import { isAppError } from '@/lib/errors'
import { uuidField } from '@/schemas/common'
import { getVariantStock, listMovements } from '@/services/admin/inventory.service'
import { cn } from '@/utils/cn'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.inventory.history }
}

export default async function VariantStockPage({
  params,
}: PageProps<'/admin/inventory/[variantId]'>) {
  const { variantId } = await params
  const access = await adminAccess('INVENTORY_VIEW', `/admin/inventory/${variantId}`)
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const parsed = uuidField.safeParse(variantId)
  if (!parsed.success) notFound()
  let variant
  try {
    variant = await getVariantStock(parsed.data)
  } catch (error) {
    if (isAppError(error) && error.status === 404) notFound()
    throw error
  }
  const { locale, dict, session } = access
  const t = dict.admin.inventory
  const ar = locale === 'ar'
  const movements = await listMovements(variant.id)
  const inventory = variant.inventory!
  const n = (value: number) => formatNumber(value, locale)
  const threshold = inventory.lowStockThreshold ?? variant.product.lowStockThreshold

  return (
    <div className="space-y-6">
      <AdminPageHeader
        locale={locale}
        back={{ href: '/admin/inventory', label: t.back }}
        title={`${ar ? variant.product.nameAr : variant.product.nameEn} · ${ar ? variant.nameAr : variant.nameEn}`}
        description={<span className="ltr-nums">{variant.sku}</span>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card title={t.title}>
          <DefinitionList
            items={[
              { label: t.columns.onHand, value: n(inventory.onHand) },
              { label: t.columns.reserved, value: n(inventory.reserved) },
              {
                label: t.columns.available,
                value: <strong>{n(Math.max(inventory.onHand - inventory.reserved, 0))}</strong>,
              },
              { label: t.columns.threshold, value: n(threshold) },
            ]}
          />
          <p className="mt-4 text-xs">
            <Link
              href={`/admin/products/${variant.product.id}` as Route}
              className="underline underline-offset-4"
            >
              {ar ? variant.product.nameAr : variant.product.nameEn}
            </Link>
          </p>
        </Card>
        {hasPermission(session.user, 'INVENTORY_ADJUST') ? (
          <Card title={t.adjust}>
            <AdjustStockForm
              locale={locale}
              variantId={variant.id}
              t={t}
              submitLabel={t.submit}
              fieldMessages={dict.errors.fields}
              genericError={dict.errors.generic}
            />
          </Card>
        ) : null}
      </div>
      <Card title={t.history} bodyClassName="p-0">
        <DataTable
          caption={t.history}
          isEmpty={movements.length === 0}
          empty={dict.admin.table.empty}
          head={
            <tr>
              <Th>{t.ledger.date}</Th>
              <Th>{t.ledger.type}</Th>
              <Th className="text-end">{t.ledger.change}</Th>
              <Th className="text-end">{t.ledger.after}</Th>
              <Th>{t.ledger.reason}</Th>
              <Th>{t.ledger.by}</Th>
            </tr>
          }
        >
          {movements.map((movement) => (
            <tr key={movement.id}>
              <Td className="whitespace-nowrap text-muted">
                {formatDateTime(movement.createdAt, locale)}
              </Td>
              <Td>{t.movements[movement.type]}</Td>
              <Td className="text-end tabular-nums">
                {movement.quantityDelta !== 0 ? (
                  <span
                    dir="ltr"
                    className={cn(movement.quantityDelta > 0 ? 'text-success' : 'text-danger')}
                  >
                    {movement.quantityDelta > 0 ? '+' : '−'}
                    {n(Math.abs(movement.quantityDelta))}
                  </span>
                ) : (
                  <span dir="ltr" className="text-muted">
                    {movement.reservedDelta > 0 ? '+' : '−'}
                    {n(Math.abs(movement.reservedDelta))} ({t.columns.reserved})
                  </span>
                )}
              </Td>
              <Td className="text-end text-muted tabular-nums">
                {n(movement.newOnHand)} / {n(movement.newReserved)}
              </Td>
              <Td className="text-xs text-text">
                {movement.reason ?? '—'}
                {movement.orderId ? (
                  <Link
                    href={`/admin/orders/${movement.orderId}` as Route}
                    className="ms-2 underline underline-offset-4"
                  >
                    {t.ledger.order}
                  </Link>
                ) : null}
              </Td>
              <Td className="text-muted">{movement.actorName ?? '—'}</Td>
            </tr>
          ))}
        </DataTable>
      </Card>
    </div>
  )
}
