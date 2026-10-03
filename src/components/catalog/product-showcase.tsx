'use client'

import Image from 'next/image'
import { type ReactNode, useMemo, useState } from 'react'
import type { Dictionary } from '@/i18n'
import { interpolate, plural } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { discountPercent } from '@/utils/money'
import { cn } from '@/utils/cn'
import { Price } from './price'

export interface ShowcaseImage {
  id: string
  url: string
  alt: string
}

export interface ShowcaseVariant {
  id: string
  sku: string
  colorKey: string | null
  colorName: string | null
  colorHex: string | null
  size: string | null
  price: number
  compareAtPrice: number | null
  stock: 'in_stock' | 'low_stock' | 'out_of_stock'
  lowStockCount: number | null
  imageId: string | null
}

interface ProductShowcaseProps {
  locale: Locale
  t: Dictionary['store']['product']
  cardT: Dictionary['store']['card']
  images: ShowcaseImage[]
  variants: ShowcaseVariant[]
  defaultVariantId: string | null
  header: ReactNode
  /** Purchase actions for the selected variant (wired in by the cart feature). */
  renderActions?: (variant: ShowcaseVariant | null) => ReactNode
  children?: ReactNode
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

export function ProductShowcase({
  locale,
  t,
  cardT,
  images,
  variants,
  defaultVariantId,
  header,
  renderActions,
  children,
}: ProductShowcaseProps) {
  const initial = variants.find((v) => v.id === defaultVariantId) ?? variants[0] ?? null
  const [color, setColor] = useState<string | null>(initial?.colorKey ?? null)
  const [size, setSize] = useState<string | null>(initial?.size ?? null)
  const [imageIndex, setImageIndex] = useState(() => {
    const index = images.findIndex((image) => image.id === initial?.imageId)
    return index >= 0 ? index : 0
  })

  const colors = useMemo(
    () =>
      unique(variants.map((v) => v.colorKey).filter((key): key is string => key !== null)).map(
        (key) => {
          const sample = variants.find((v) => v.colorKey === key)!
          return {
            key,
            name: sample.colorName ?? key,
            hex: sample.colorHex,
            soldOut: variants
              .filter((v) => v.colorKey === key)
              .every((v) => v.stock === 'out_of_stock'),
          }
        },
      ),
    [variants],
  )
  const sizesForColor = useMemo(
    () =>
      unique(
        variants
          .filter((v) => color === null || v.colorKey === color)
          .map((v) => v.size)
          .filter((s): s is string => s !== null),
      ),
    [variants, color],
  )

  const selected =
    variants.find(
      (v) =>
        (color === null || v.colorKey === color) && (sizesForColor.length === 0 || v.size === size),
    ) ?? null

  function chooseColor(key: string) {
    setColor(key)
    const candidates = variants.filter((v) => v.colorKey === key)
    const keepSize = candidates.some((v) => v.size === size)
    const next = keepSize
      ? candidates.find((v) => v.size === size)
      : (candidates.find((v) => v.stock !== 'out_of_stock') ?? candidates[0])
    if (!keepSize) setSize(next?.size ?? null)
    const index = images.findIndex((image) => image.id === next?.imageId)
    if (index >= 0) setImageIndex(index)
  }

  const activeImage = images[imageIndex] ?? images[0] ?? null
  const percent = selected ? discountPercent(selected.price, selected.compareAtPrice) : 0

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
      {/* Gallery */}
      <section aria-label={t.gallery} className="lg:sticky lg:top-36 lg:self-start">
        <div className="relative aspect-[4/5] overflow-hidden bg-sand">
          {activeImage ? (
            <Image
              key={activeImage.id}
              src={activeImage.url}
              alt={activeImage.alt}
              fill
              priority
              sizes="(min-width: 1024px) 55vw, 100vw"
              className="object-cover"
            />
          ) : null}
        </div>
        {images.length > 1 ? (
          <ul className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-6">
            {images.map((image, index) => (
              <li key={image.id}>
                <button
                  type="button"
                  onClick={() => setImageIndex(index)}
                  aria-label={interpolate(t.showImage, { number: index + 1 })}
                  aria-current={index === imageIndex ? 'true' : undefined}
                  className={cn(
                    'relative block aspect-[4/5] w-full overflow-hidden bg-sand transition-opacity',
                    index === imageIndex
                      ? 'ring-1 ring-ink ring-offset-2 ring-offset-ivory'
                      : 'opacity-70 hover:opacity-100',
                  )}
                >
                  <Image src={image.url} alt="" fill sizes="96px" className="object-cover" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* Purchase panel */}
      <div>
        {header}

        <div className="mt-6" data-testid="product-price">
          {selected ? (
            <Price
              locale={locale}
              t={cardT}
              price={selected.price}
              compareAtPrice={selected.compareAtPrice}
              size="lg"
            />
          ) : null}
          {percent > 0 ? (
            <p className="mt-1 text-sm text-champagne-strong">
              {interpolate(cardT.sale, { percent })}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted">{t.priceIncludesVat}</p>
        </div>

        {colors.length > 0 ? (
          <fieldset className="mt-8">
            <legend className="text-sm text-ink">
              {selected?.colorName
                ? interpolate(t.selectedColor, { color: selected.colorName })
                : t.color}
            </legend>
            <div className="mt-3 flex flex-wrap gap-3">
              {colors.map((option) => (
                <label key={option.key} className="relative cursor-pointer" title={option.name}>
                  <input
                    type="radio"
                    name="color"
                    value={option.key}
                    checked={color === option.key}
                    onChange={() => chooseColor(option.key)}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      'block size-9 rounded-full border border-line-strong ring-offset-2 ring-offset-ivory transition',
                      'peer-checked:ring-1 peer-checked:ring-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink',
                      option.soldOut && 'opacity-40',
                    )}
                    style={{ backgroundColor: option.hex ?? undefined }}
                    aria-hidden="true"
                  />
                  <span className="sr-only">
                    {option.name}
                    {option.soldOut ? ` — ${t.outOfStock}` : ''}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {sizesForColor.length > 0 ? (
          <fieldset className="mt-6">
            <legend className="text-sm text-ink">{t.size}</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {sizesForColor.map((option) => {
                const variant = variants.find(
                  (v) => (color === null || v.colorKey === color) && v.size === option,
                )
                const soldOut = variant?.stock === 'out_of_stock'
                return (
                  <label key={option} className="cursor-pointer">
                    <input
                      type="radio"
                      name="size"
                      value={option}
                      checked={size === option}
                      onChange={() => setSize(option)}
                      className="peer sr-only"
                    />
                    <span
                      className={cn(
                        'ltr-nums inline-flex h-10 min-w-12 items-center justify-center border px-3 text-sm transition-colors',
                        'peer-checked:border-ink peer-checked:bg-ink peer-checked:text-paper',
                        'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink',
                        soldOut
                          ? 'border-line text-muted line-through'
                          : 'border-line-strong text-ink hover:border-ink',
                      )}
                    >
                      {option}
                    </span>
                    {soldOut ? <span className="sr-only"> — {t.outOfStock}</span> : null}
                  </label>
                )
              })}
            </div>
          </fieldset>
        ) : null}

        <p className="mt-6 text-sm" role="status" data-testid="stock-status">
          {selected === null ? (
            <span className="text-muted">{t.unavailableCombination}</span>
          ) : selected.stock === 'out_of_stock' ? (
            <span className="text-danger">{t.outOfStock}</span>
          ) : selected.stock === 'low_stock' && selected.lowStockCount !== null ? (
            <span className="text-warning">
              {plural(locale, selected.lowStockCount, t.lowStock)}
            </span>
          ) : (
            <span className="text-success">{t.inStock}</span>
          )}
        </p>

        {renderActions ? <div className="mt-6">{renderActions(selected)}</div> : null}

        {selected ? (
          <p className="ltr-nums mt-4 text-xs text-muted">
            {interpolate(t.sku, { sku: selected.sku })}
          </p>
        ) : null}

        {children ? <div className="mt-10">{children}</div> : null}
      </div>
    </div>
  )
}
