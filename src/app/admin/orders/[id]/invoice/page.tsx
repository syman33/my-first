import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AdminForbidden } from '@/components/admin/admin-forbidden'
import { InvoiceDocument } from '@/components/orders/invoice-document'
import { PrintButton } from '@/components/orders/print-button'
import { getDictionary } from '@/i18n'
import { adminAccess, getAdminLocale } from '@/lib/admin/access'
import { isAppError } from '@/lib/errors'
import { uuidField } from '@/schemas/common'
import { getOrderDetailForStaff } from '@/services/orders/order-query.service'
import { getSettings } from '@/services/settings/settings.service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: getDictionary(await getAdminLocale()).orders.invoice.title }
}

/** The same invoice the customer sees, for the team to print or send. */
export default async function AdminInvoicePage({
  params,
}: PageProps<'/admin/orders/[id]/invoice'>) {
  const { id } = await params
  const access = await adminAccess('ORDERS_VIEW', `/admin/orders/${id}/invoice`)
  if (access.status !== 'ok') {
    return (
      <AdminForbidden locale={access.locale} dict={access.dict} isCustomer={access.isCustomer} />
    )
  }
  const parsed = uuidField.safeParse(id)
  if (!parsed.success) notFound()
  const { locale, dict } = access
  let order
  try {
    order = await getOrderDetailForStaff(parsed.data, locale)
  } catch (error) {
    if (isAppError(error) && error.code === 'ORDER_NOT_FOUND') notFound()
    throw error
  }
  const store = await getSettings('store')

  return (
    <div className="print:max-w-none print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton label={dict.orders.invoice.print} />
      </div>
      <InvoiceDocument locale={locale} order={order} store={store} dict={dict} />
    </div>
  )
}
