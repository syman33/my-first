import { Logo } from '@/components/brand/logo'
import { type Dictionary, interpolate } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { formatBasisPoints, formatDate, formatMoney } from '@/i18n/format'
import type { StoreSettings } from '@/schemas/settings'
import type { CustomerOrderDetail } from '@/types/orders'
import { addressLines } from '@/utils/address'
import { formatSaudiMobile } from '@/utils/phone'

/**
 * Printable invoice built from the order snapshot (prices and names as
 * purchased), shared by the customer's account and the back office. It is
 * not a ZATCA e-invoice, and says so.
 */
export function InvoiceDocument({
  locale,
  order,
  store,
  dict,
}: {
  locale: Locale
  order: CustomerOrderDetail
  store: StoreSettings
  dict: Dictionary
}) {
  const t = dict.orders.invoice
  const money = (amount: number) => formatMoney(amount, locale)
  const rate = formatBasisPoints(order.taxRateBps, locale)

  return (
    <article
      className="mx-auto max-w-3xl border border-line bg-paper p-8 text-sm text-text print:border-0 print:p-0"
      aria-label={t.title}
    >
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
        <div>
          <Logo withArabic className="h-12 w-auto text-ink" />
          <div className="mt-4 space-y-0.5 text-xs text-muted">
            <p className="font-medium text-ink">
              {(locale === 'ar' ? store.legalNameAr : store.legalNameEn) ??
                (locale === 'ar' ? store.nameAr : store.nameEn)}
            </p>
            <p>{locale === 'ar' ? store.addressAr : store.addressEn}</p>
            <p className="ltr-nums">{store.phone}</p>
            <p>{store.email}</p>
            {store.vatNumber ? (
              <p className="ltr-nums">{interpolate(t.vatNumber, { number: store.vatNumber })}</p>
            ) : null}
            {store.commercialRegistration ? (
              <p className="ltr-nums">
                {interpolate(t.cr, { number: store.commercialRegistration })}
              </p>
            ) : null}
          </div>
        </div>
        <div className="text-end">
          <h1 className="font-display text-3xl text-ink">
            {store.vatNumber ? t.taxInvoice : t.title}
          </h1>
          <dl className="mt-3 space-y-1 text-xs">
            <div>
              <dt className="inline text-muted">{t.number}: </dt>
              <dd className="ltr-nums inline font-medium text-ink">{order.orderNumber}</dd>
            </div>
            <div>
              <dt className="inline text-muted">{t.date}: </dt>
              <dd className="inline">{formatDate(order.createdAt, locale, 'long')}</dd>
            </div>
            <div>
              <dt className="inline text-muted">{dict.orders.detail.paymentStatus}: </dt>
              <dd className="inline">{dict.orders.paymentStatus[order.paymentStatus]}</dd>
            </div>
          </dl>
        </div>
      </header>

      <section className="border-b border-line py-6" aria-label={t.billTo}>
        <h2 className="text-xs text-muted">{t.billTo}</h2>
        <p className="mt-2 font-medium text-ink">{order.shippingAddress.fullName}</p>
        {addressLines(order.shippingAddress, locale).map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p className="ltr-nums">{formatSaudiMobile(order.shippingAddress.phone)}</p>
        <p>{order.shippingAddress.email}</p>
      </section>

      <table className="mt-6 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-line-strong text-muted">
            <th scope="col" className="py-2 text-start font-medium">
              {t.item}
            </th>
            <th scope="col" className="py-2 text-center font-medium">
              {t.qty}
            </th>
            <th scope="col" className="py-2 text-end font-medium">
              {t.unitPrice}
            </th>
            <th scope="col" className="py-2 text-end font-medium">
              {t.discount}
            </th>
            <th scope="col" className="py-2 text-end font-medium">
              {t.lineTotal}
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="border-b border-line align-top">
              <td className="py-3">
                <p className="font-medium text-ink">{item.name}</p>
                <p className="text-muted">
                  {item.variantName} · <span className="ltr-nums">{item.sku}</span>
                </p>
              </td>
              <td className="ltr-nums py-3 text-center">{item.quantity}</td>
              <td className="ltr-nums py-3 text-end">{money(item.unitPrice)}</td>
              <td className="ltr-nums py-3 text-end">
                {item.discountAmount > 0 ? `−${money(item.discountAmount)}` : '—'}
              </td>
              <td className="ltr-nums py-3 text-end">{money(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ms-auto mt-6 max-w-xs space-y-2">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">{dict.cart.bag.subtotal}</dt>
          <dd className="ltr-nums">{money(order.subtotal)}</dd>
        </div>
        {order.discountTotal > 0 ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">
              {interpolate(dict.cart.bag.discount, { code: order.couponCode ?? '' })}
            </dt>
            <dd className="ltr-nums">−{money(order.discountTotal)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-muted">{dict.checkout.shipping[order.shippingMethod]}</dt>
          <dd className="ltr-nums">{money(order.shippingTotal)}</dd>
        </div>
        {order.codFee > 0 ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{dict.cart.bag.codFee}</dt>
            <dd className="ltr-nums">{money(order.codFee)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-muted">{interpolate(dict.cart.bag.vat, { rate })}</dt>
          <dd className="ltr-nums">{money(order.taxTotal)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-line-strong pt-2 text-base font-medium text-ink">
          <dt>{dict.cart.bag.total}</dt>
          <dd className="ltr-nums">{money(order.total)}</dd>
        </div>
        {order.pricesIncludeTax ? <p className="text-xs text-muted">{t.totalsIncludeVat}</p> : null}
      </dl>

      <p className="mt-10 border-t border-line pt-4 text-[11px] text-muted">{t.notice}</p>
    </article>
  )
}
