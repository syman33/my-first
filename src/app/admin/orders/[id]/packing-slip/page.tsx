import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { PrintButton } from '@/components/orders/print-button'
import { getDictionary, interpolate } from '@/i18n'
import { formatDate, formatMoney, formatNumber } from '@/i18n/format'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { isAppError } from '@/lib/errors'
import { uuidField } from '@/schemas/common'
import { getAdminOrder } from '@/services/admin/orders.service'
import { getSettings } from '@/services/settings/settings.service'
import { addressLines } from '@/utils/address'
import { formatSaudiMobile } from '@/utils/phone'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).admin.orders.packing.title }
}

/** What goes in the parcel and where it goes. No prices except the cash to collect. */
export default async function PackingSlipPage({
  params,
}: PageProps<'/admin/orders/[id]/packing-slip'>) {
  const { id } = await params
  const access = await adminAccess('ORDERS_VIEW', `/admin/orders/${id}/packing-slip`)
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const parsed = uuidField.safeParse(id)
  if (!parsed.success) notFound()
  let order
  try {
    order = await getAdminOrder(parsed.data)
  } catch (error) {
    if (isAppError(error) && error.code === 'ORDER_NOT_FOUND') notFound()
    throw error
  }
  const { locale, dict } = access
  const t = dict.admin.orders.packing
  const store = await getSettings('store')
  const ar = locale === 'ar'
  const collectCash = order.paymentMethod === 'COD' && order.paymentStatus === 'PENDING'

  return (
    <article className="mx-auto max-w-3xl bg-paper p-8 print:max-w-none print:p-0">
      <div className="flex items-start justify-between gap-6 border-b border-ink pb-6">
        <div>
          <p className="font-display text-2xl tracking-[0.3em] text-ink">VÉLORA</p>
          <p className="mt-1 text-xs text-muted">{ar ? store.nameAr : store.nameEn}</p>
        </div>
        <div className="text-end text-sm">
          <h1 className="font-medium text-ink">{t.title}</h1>
          <p className="ltr-nums mt-1 text-lg font-medium text-ink">{order.orderNumber}</p>
          <p className="text-muted">
            {t.orderDate}: {formatDate(order.createdAt, locale)}
          </p>
        </div>
      </div>

      <section className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="text-xs tracking-wide text-muted uppercase">{t.shipTo}</h2>
          <address className="mt-2 space-y-0.5 text-sm text-ink not-italic">
            <p className="font-medium">{order.shipping.name}</p>
            {addressLines(order.shipping, locale).map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p className="ltr-nums">{formatSaudiMobile(order.shipping.phone)}</p>
            {order.shipping.instructions ? (
              <p className="pt-1 text-muted">{order.shipping.instructions}</p>
            ) : null}
          </address>
        </div>
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-muted">{t.delivery}: </span>
            {dict.checkout.shipping[order.shippingMethod]}
          </p>
          <p>
            <span className="text-muted">{t.payment}: </span>
            {dict.paymentMethodNames[order.paymentMethod]}
          </p>
          {collectCash ? (
            <p className="border border-ink px-3 py-2 font-medium text-ink">
              {interpolate(t.codCollect, { amount: formatMoney(order.total, locale) })}
            </p>
          ) : null}
        </div>
      </section>

      <table className="mt-8 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink text-xs text-muted">
            <th scope="col" className="py-2 text-start font-medium">
              {t.item}
            </th>
            <th scope="col" className="py-2 text-start font-medium">
              {t.sku}
            </th>
            <th scope="col" className="py-2 text-end font-medium">
              {t.qty}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {order.items.map((item) => (
            <tr key={item.id}>
              <td className="py-3">
                <p className="text-ink">{ar ? item.nameAr : item.nameEn}</p>
                {(ar ? item.variantNameAr : item.variantNameEn) ? (
                  <p className="text-xs text-muted">
                    {ar ? item.variantNameAr : item.variantNameEn}
                  </p>
                ) : null}
              </td>
              <td className="ltr-nums py-3 text-muted">{item.sku}</td>
              <td className="py-3 text-end text-base font-medium tabular-nums">
                {formatNumber(item.quantity, locale)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {order.customerNote ? (
        <section className="mt-6 border border-line p-4 text-sm">
          <h2 className="text-xs text-muted">{t.note}</h2>
          <p className="mt-1 whitespace-pre-line text-ink">{order.customerNote}</p>
        </section>
      ) : null}

      <div className="mt-8 print:hidden">
        <PrintButton label={t.print} />
      </div>
    </article>
  )
}
