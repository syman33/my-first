import Link from 'next/link'
import type { Route } from 'next'
import { type ReactNode, useId } from 'react'
import type { ColorFamily } from '@/generated/prisma/enums'
import type { Dictionary } from '@/i18n'
import type { ListingFilters } from '@/schemas/catalog'
import type { ListingFacets } from '@/types/catalog'
import { cn } from '@/utils/cn'
import { AutoSubmitForm } from './auto-submit-form'

/** Swatch colours for colour families (display only). */
export const COLOR_SWATCHES: Record<ColorFamily, string> = {
  BLACK: '#1a1a1a',
  WHITE: '#ffffff',
  BEIGE: '#d9c7a7',
  BROWN: '#6b4a32',
  TAN: '#b5835a',
  GREY: '#8d8d8d',
  NAVY: '#1f2a44',
  BLUE: '#3d6db5',
  GREEN: '#3f6b4e',
  RED: '#a23b32',
  PINK: '#e3a9b6',
  PURPLE: '#6b4c8a',
  YELLOW: '#e0c04f',
  GOLD: '#c9a24d',
  SILVER: '#c0c0c0',
  ROSE_GOLD: '#d4a08f',
  MULTI: 'conic-gradient(#a23b32, #e0c04f, #3f6b4e, #3d6db5, #6b4c8a, #a23b32)',
}

export interface FilterFormOptions {
  showCategories: boolean
  showGenders: boolean
  showSale: boolean
}

interface FilterFormProps {
  action: string
  t: Dictionary['store']['listing']
  colorNames: Dictionary['store']['colors']
  genderNames: Dictionary['store']['genders']
  locale: 'ar' | 'en'
  filters: ListingFilters
  facets: ListingFacets
  options: FilterFormOptions
  clearHref: string
  autoSubmit: boolean
  defaultSort: ListingFilters['sort']
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="border-b border-line py-5 first:pt-0">
      <legend className="mb-3 text-xs font-medium tracking-wide text-ink uppercase">
        {legend}
      </legend>
      <div className="space-y-2.5">{children}</div>
    </fieldset>
  )
}

function CheckOption({
  name,
  value,
  checked,
  children,
}: {
  name: string
  value: string
  checked: boolean
  children: ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm text-text">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={checked}
        className="size-4 shrink-0 accent-ink"
      />
      {children}
    </label>
  )
}

/** Filter sidebar as a GET form: shareable URLs, works without JavaScript. */
export function FilterForm({
  action,
  t,
  colorNames,
  genderNames,
  locale,
  filters,
  facets,
  options,
  clearHref,
  autoSubmit,
  defaultSort,
}: FilterFormProps) {
  const id = useId()
  return (
    <AutoSubmitForm action={action} autoSubmit={autoSubmit} className="text-sm">
      {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
      {filters.sort !== defaultSort ? (
        <input type="hidden" name="sort" value={filters.sort} />
      ) : null}

      {options.showCategories && facets.categories.length > 0 ? (
        <Group legend={t.category}>
          {facets.categories.map((category) => (
            <CheckOption
              key={category.slug}
              name="category"
              value={category.slug}
              checked={filters.categories.includes(category.slug)}
            >
              {locale === 'ar' ? category.nameAr : category.nameEn}
            </CheckOption>
          ))}
        </Group>
      ) : null}

      {options.showGenders && facets.genders.length > 1 ? (
        <Group legend={t.gender}>
          {facets.genders.map((gender) => (
            <CheckOption
              key={gender}
              name="gender"
              value={gender.toLowerCase()}
              checked={filters.genders.includes(gender)}
            >
              {genderNames[gender]}
            </CheckOption>
          ))}
        </Group>
      ) : null}

      {facets.colors.length > 0 ? (
        <Group legend={t.color}>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            {facets.colors.map((color) => (
              <CheckOption
                key={color}
                name="color"
                value={color.toLowerCase()}
                checked={filters.colors.includes(color)}
              >
                <span
                  className="size-4 shrink-0 rounded-full border border-line-strong"
                  style={{ background: COLOR_SWATCHES[color] }}
                  aria-hidden="true"
                />
                {colorNames[color]}
              </CheckOption>
            ))}
          </div>
        </Group>
      ) : null}

      {facets.brands.length > 1 ? (
        <Group legend={t.brand}>
          {facets.brands.map((brand) => (
            <CheckOption
              key={brand.slug}
              name="brand"
              value={brand.slug}
              checked={filters.brands.includes(brand.slug)}
            >
              {locale === 'ar' ? brand.nameAr : brand.nameEn}
            </CheckOption>
          ))}
        </Group>
      ) : null}

      {facets.priceRange ? (
        <Group legend={t.price}>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`${id}-min`}>
              {t.priceMin}
            </label>
            <input
              id={`${id}-min`}
              name="min"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              defaultValue={filters.minPrice !== null ? Math.floor(filters.minPrice / 100) : ''}
              placeholder={String(Math.floor(facets.priceRange.min / 100))}
              className="ltr-nums h-10 w-full border border-line-strong bg-paper px-3 text-sm focus:border-ink focus:outline-none"
              dir="ltr"
            />
            <span aria-hidden="true" className="text-muted">
              –
            </span>
            <label className="sr-only" htmlFor={`${id}-max`}>
              {t.priceMax}
            </label>
            <input
              id={`${id}-max`}
              name="max"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              defaultValue={filters.maxPrice !== null ? Math.floor(filters.maxPrice / 100) : ''}
              placeholder={String(Math.ceil(facets.priceRange.max / 100))}
              className="ltr-nums h-10 w-full border border-line-strong bg-paper px-3 text-sm focus:border-ink focus:outline-none"
              dir="ltr"
            />
          </div>
        </Group>
      ) : null}

      <Group legend={t.availability}>
        <CheckOption name="instock" value="1" checked={filters.inStock}>
          {t.inStockOnly}
        </CheckOption>
        {options.showSale ? (
          <CheckOption name="sale" value="1" checked={filters.onSale}>
            {t.onSaleOnly}
          </CheckOption>
        ) : null}
      </Group>

      <div className={cn('flex items-center justify-between gap-4 pt-5')}>
        <button
          type="submit"
          className="h-11 flex-1 bg-ink px-5 text-sm font-medium text-paper hover:bg-[#2c2c2c]"
        >
          {t.applyFilters}
        </button>
        <Link
          href={clearHref as Route}
          className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          {t.clearAll}
        </Link>
      </div>
    </AutoSubmitForm>
  )
}
