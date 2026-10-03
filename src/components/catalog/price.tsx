import type { Dictionary } from '@/i18n'
import { interpolate } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { formatMoney } from '@/i18n/format'
import { cn } from '@/utils/cn'

interface PriceProps {
  locale: Locale
  t: Dictionary['store']['card']
  price: number
  compareAtPrice: number | null
  priceFrom?: boolean
  size?: 'sm' | 'lg'
  className?: string
}

/** Selling price with the previous price struck through; screen readers hear both labelled. */
export function Price({
  locale,
  t,
  price,
  compareAtPrice,
  priceFrom = false,
  size = 'sm',
  className,
}: PriceProps) {
  const current = formatMoney(price, locale)
  return (
    <p className={cn('flex flex-wrap items-baseline gap-x-2', className)}>
      <span className={cn('font-medium text-ink', size === 'lg' ? 'text-xl' : 'text-sm')}>
        {compareAtPrice ? (
          <span className="sr-only">{interpolate(t.now, { price: current })}</span>
        ) : null}
        <span aria-hidden={compareAtPrice ? true : undefined}>
          {priceFrom ? interpolate(t.from, { price: current }) : current}
        </span>
      </span>
      {compareAtPrice ? (
        <del className={cn('text-muted', size === 'lg' ? 'text-base' : 'text-xs')}>
          <span className="sr-only">
            {interpolate(t.was, { price: formatMoney(compareAtPrice, locale) })}
          </span>
          <span aria-hidden="true">{formatMoney(compareAtPrice, locale)}</span>
        </del>
      ) : null}
    </p>
  )
}
