import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { InvoiceDocument } from '@/components/orders/invoice-document'
import { PrintButton } from '@/components/orders/print-button'
import { getDictionary } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { requireUserPage } from '@/lib/auth/current-user'
import { isAppError } from '@/lib/errors'
import { uuidField } from '@/schemas/common'
import { getCustomerOrder } from '@/services/orders/order-query.service'
import { getSettings } from '@/services/settings/settings.service'

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/account/orders/[id]/invoice'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return {
    title: getDictionary(locale).orders.invoice.title,
    robots: { index: false, follow: false },
  }
}

/** The customer's printable invoice for one of their own orders. */
export default async function InvoicePage({
  params,
}: PageProps<'/[locale]/account/orders/[id]/invoice'>) {
  const { locale, id } = await params
  if (!isLocale(locale)) notFound()
  const { user } = await requireUserPage(locale, `/${locale}/account/orders/${id}/invoice`)
  const parsed = uuidField.safeParse(id)
  if (!parsed.success) notFound()
  let order
  try {
    order = await getCustomerOrder(user.id, parsed.data, locale)
  } catch (error) {
    if (isAppError(error) && error.code === 'ORDER_NOT_FOUND') notFound()
    throw error
  }
  const [store, dict] = [await getSettings('store'), getDictionary(locale)]

  return (
    <div className="container-luxe py-8 print:max-w-none print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton label={dict.orders.invoice.print} />
      </div>
      <InvoiceDocument locale={locale} order={order} store={store} dict={dict} />
    </div>
  )
}
