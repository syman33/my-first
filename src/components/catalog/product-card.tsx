import Image from 'next/image'
import Link from 'next/link'
import type { Route } from 'next'
import type { Dictionary } from '@/i18n'
import { interpolate } from '@/i18n'
import type { Locale } from '@/i18n/config'
import type { ProductBadge, ProductCardData } from '@/lib/catalog/presentation'
import { cn } from '@/utils/cn'
import { Price } from './price'
import { RatingStars } from './rating-stars'

function badgeLabel(badge: ProductBadge, t: Dictionary['store']['card']): string {
  switch (badge.kind) {
    case 'sold_out':
      return t.soldOut
    case 'sale':
      return interpolate(t.sale, { percent: badge.percent })
    case 'new':
      return t.new
    case 'bestseller':
      return t.bestseller
  }
}

interface ProductCardProps {
  locale: Locale
  product: ProductCardData
  t: Dictionary['store']['card']
  /** Above-the-fold cards load eagerly. */
  priority?: boolean
}

/**
 * Editorial product card: one link wrapping image and text (a single tab
 * stop), a second image revealed on hover, and restrained metadata.
 */
export function ProductCard({ locale, product, t, priority = false }: ProductCardProps) {
  return (
    <article className="group relative" data-testid="product-card">
      <Link href={product.href as Route} className="block focus-visible:outline-offset-4">
        <div className="relative aspect-[4/5] overflow-hidden bg-sand">
          {product.image ? (
            <Image
              src={product.image.url}
              alt={product.image.alt}
              fill
              sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 46vw"
              className={cn(
                'object-cover transition-opacity duration-500 ease-luxe',
                product.hoverImage && 'group-hover:opacity-0',
                product.stock === 'out_of_stock' && 'opacity-70',
              )}
              priority={priority}
            />
          ) : null}
          {product.hoverImage ? (
            <Image
              src={product.hoverImage.url}
              alt=""
              fill
              sizes="(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 46vw"
              className="object-cover opacity-0 transition-opacity duration-500 ease-luxe group-hover:opacity-100"
            />
          ) : null}
          {product.badge ? (
            <span
              className={cn(
                'absolute start-3 top-3 px-2 py-1 text-[11px] font-medium',
                product.badge.kind === 'sold_out' ? 'bg-paper text-muted' : 'bg-ink text-paper',
              )}
            >
              {badgeLabel(product.badge, t)}
            </span>
          ) : null}
        </div>
        <div className="mt-4 space-y-1">
          <p className="text-[11px] text-muted">{product.brandName ?? product.categoryName}</p>
          <h3 className="text-sm leading-6 text-ink">{product.name}</h3>
          <Price
            locale={locale}
            t={t}
            price={product.price}
            compareAtPrice={product.compareAtPrice}
            priceFrom={product.priceFrom}
          />
        </div>
      </Link>
      <div className="mt-2 flex items-center justify-between gap-2">
        {product.swatches.length > 1 ? (
          <ul className="flex items-center gap-1.5" aria-label={t.colors}>
            {product.swatches.slice(0, 5).map((swatch) => (
              <li key={swatch.hex}>
                <span
                  className="block size-3 rounded-full border border-line-strong"
                  style={{ backgroundColor: swatch.hex }}
                  title={swatch.name}
                >
                  <span className="sr-only">{swatch.name}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        {product.rating ? (
          <RatingStars
            rating={product.rating.average}
            label={interpolate(t.rating, { rating: product.rating.average.toFixed(1) })}
          />
        ) : null}
      </div>
    </article>
  )
}
