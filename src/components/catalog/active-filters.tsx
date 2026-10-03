import Link from 'next/link'
import type { Route } from 'next'
import { X } from 'lucide-react'
import type { Dictionary } from '@/i18n'
import { interpolate } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { formatMoney } from '@/i18n/format'
import { type ListingFilters, listingQueryString, type SortOption } from '@/schemas/catalog'
import type { ListingFacets } from '@/types/catalog'

interface ActiveFiltersProps {
  locale: Locale
  basePath: string
  defaults: { sort: SortOption }
  filters: ListingFilters
  facets: ListingFacets
  t: Dictionary['store']['listing']
  colorNames: Dictionary['store']['colors']
  genderNames: Dictionary['store']['genders']
}

/** Removable chips for every applied filter (each chip is a plain link). */
export function ActiveFilters({
  locale,
  basePath,
  defaults,
  filters,
  facets,
  t,
  colorNames,
  genderNames,
}: ActiveFiltersProps) {
  const reset = { page: 1 }
  const chips: { key: string; label: string; href: string }[] = []
  const href = (overrides: Partial<ListingFilters>) =>
    `${basePath}${listingQueryString(filters, defaults, { ...reset, ...overrides })}`

  for (const slug of filters.categories) {
    const category = facets.categories.find((c) => c.slug === slug)
    chips.push({
      key: `category-${slug}`,
      label: category ? (locale === 'ar' ? category.nameAr : category.nameEn) : slug,
      href: href({ categories: filters.categories.filter((s) => s !== slug) }),
    })
  }
  for (const gender of filters.genders) {
    chips.push({
      key: `gender-${gender}`,
      label: genderNames[gender],
      href: href({ genders: filters.genders.filter((g) => g !== gender) }),
    })
  }
  for (const color of filters.colors) {
    chips.push({
      key: `color-${color}`,
      label: colorNames[color],
      href: href({ colors: filters.colors.filter((c) => c !== color) }),
    })
  }
  for (const slug of filters.brands) {
    const brand = facets.brands.find((b) => b.slug === slug)
    chips.push({
      key: `brand-${slug}`,
      label: brand ? (locale === 'ar' ? brand.nameAr : brand.nameEn) : slug,
      href: href({ brands: filters.brands.filter((s) => s !== slug) }),
    })
  }
  if (filters.minPrice !== null || filters.maxPrice !== null) {
    const min = filters.minPrice ?? facets.priceRange?.min ?? 0
    const max = filters.maxPrice ?? facets.priceRange?.max ?? min
    chips.push({
      key: 'price',
      label: interpolate(t.priceRangeLabel, {
        min: formatMoney(min, locale, { hideZeroFraction: true }),
        max: formatMoney(max, locale, { hideZeroFraction: true }),
      }),
      href: href({ minPrice: null, maxPrice: null }),
    })
  }
  if (filters.inStock)
    chips.push({ key: 'instock', label: t.inStockOnly, href: href({ inStock: false }) })
  if (filters.onSale)
    chips.push({ key: 'sale', label: t.onSaleOnly, href: href({ onSale: false }) })

  if (chips.length === 0) return null
  const clearAll = `${basePath}${listingQueryString(filters, defaults, {
    page: 1,
    categories: [],
    genders: [],
    colors: [],
    brands: [],
    minPrice: null,
    maxPrice: null,
    inStock: false,
    onSale: false,
  })}`

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={t.activeFilters} role="group">
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href as Route}
          className="inline-flex items-center gap-1.5 border border-line-strong bg-paper px-3 py-1.5 text-xs text-ink hover:border-ink"
          aria-label={interpolate(t.removeFilter, { label: chip.label })}
        >
          {chip.label}
          <X className="size-3" aria-hidden="true" />
        </Link>
      ))}
      <Link
        href={clearAll as Route}
        className="px-2 text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
      >
        {t.clearAll}
      </Link>
    </div>
  )
}
