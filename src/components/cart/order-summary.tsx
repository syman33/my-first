import type { ReactNode } from 'react'
import type { Dictionary } from '@/i18n'
import { interpolate } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { formatBasisPoints, formatMoney } from '@/i18n/format'
import type { PricingResult } from '@/lib/pricing/order-totals'

interface OrderSummaryProps {
  locale: Locale
  t: Dictionary['cart']['bag']
  totals: PricingResult
  shippingLabel?: string
  children?: ReactNode
}

/** One term/value pair; a <div> is the only wrapper a <dl> may hold around them. */
function Row({
  label,
  value,
  strong = false,
  note,
}: {
  label: ReactNode
  value: ReactNode
  strong?: boolean
  /** A second description of the same term (e.g. the VAT included in the total). */
  note?: ReactNode
}) {
  return (
    <div
      className={
        strong
          ? 'flex flex-wrap items-baseline justify-between gap-x-4 border-t border-line pt-4 text-base font-medium text-ink'
          : 'flex items-baseline justify-between gap-4'
      }
    >
      <dt>{label}</dt>
      <dd className="ltr-nums">{value}</dd>
      {note ? <dd className="mt-1 w-full text-xs font-normal text-muted">{note}</dd> : null}
    </div>
  )
}

/** Server-computed totals, displayed as-is (the client never recalculates prices). */
export function OrderSummary({ locale, t, totals, shippingLabel, children }: OrderSummaryProps) {
  const money = (amount: number) => formatMoney(amount, locale)
  const rate = formatBasisPoints(totals.taxRateBps, locale)
  return (
    <section aria-labelledby="order-summary-title" className="border border-line bg-paper p-6">
      <h2 id="order-summary-title" className="font-display text-2xl text-ink">
        {t.summary}
      </h2>
      <dl className="mt-6 space-y-3 text-sm text-text">
        <Row label={t.subtotal} value={money(totals.subtotal)} />
        {totals.coupon?.applied ? (
          <Row
            label={interpolate(t.discount, { code: totals.coupon.code })}
            value={`−${money(totals.discountTotal)}`}
          />
        ) : null}
        <Row
          label={shippingLabel ?? t.shippingEstimate}
          value={
            totals.shippingTotal === 0 && totals.itemCount > 0
              ? t.shippingFree
              : money(totals.shippingTotal)
          }
        />
        {totals.codFee > 0 ? <Row label={t.codFee} value={money(totals.codFee)} /> : null}
        {totals.taxTotal > 0 && !totals.pricesIncludeTax ? (
          <Row label={interpolate(t.vat, { rate })} value={money(totals.taxTotal)} />
        ) : null}
        <Row
          strong
          label={t.total}
          value={money(totals.total)}
          note={
            totals.taxTotal > 0 && totals.pricesIncludeTax ? (
              <>
                {interpolate(t.vatIncluded, { rate })}:{' '}
                <span className="ltr-nums">{money(totals.taxTotal)}</span>
              </>
            ) : null
          }
        />
      </dl>
      {totals.amountToFreeShipping !== null && totals.amountToFreeShipping > 0 ? (
        <p className="mt-5 bg-sand px-3 py-2 text-xs text-text">
          {interpolate(t.freeShippingProgress, { amount: money(totals.amountToFreeShipping) })}
        </p>
      ) : totals.freeShipping ? (
        <p className="mt-5 bg-success-soft px-3 py-2 text-xs text-success">
          {t.freeShippingReached}
        </p>
      ) : null}
      {children ? <div className="mt-6">{children}</div> : null}
    </section>
  )
}
