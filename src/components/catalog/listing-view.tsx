import Link from 'next/link'
import type { Route } from 'next'
import type { ReactNode } from 'react'
import { ButtonLink } from '@/components/ui/button'
import type { Dictionary } from '@/i18n'
import { interpolate, plural } from '@/i18n'
import type { Locale } from '@/i18n/config'
import {
  activeFilterCount,
  type ListingFilters,
  listingQueryString,
  type SortOption,
} from '@/schemas/catalog'
import type { ListingFacets, ListingPage } from '@/types/catalog'
import { ActiveFilters } from './active-filters'
import { FilterDrawer } from './filter-drawer'
import { FilterForm, type FilterFormOptions } from './filter-form'
import { Pagination } from './pagination'
import type { CardActions } from './product-card'
import { ProductGrid } from './product-grid'
import { SortControl } from './sort-control'

interface ListingViewProps {
  locale: Locale
  dict: Pick<Dictionary, 'store' | 'common'>
  /** Path the filters, sort and pagination link to, e.g. "/ar/bags". */
  basePath: string
  defaults: { sort: SortOption }
  filters: ListingFilters
  listing: ListingPage
  facets: ListingFacets
  options: FilterFormOptions
  header: ReactNode
  actions: CardActions
}

export function ListingView({
  locale,
  dict,
  basePath,
  defaults,
  filters,
  listing,
  facets,
  options,
  header,
  actions,
}: ListingViewProps) {
  const t = dict.store.listing
  const filterCount = activeFilterCount(filters)
  const clearHref = `${basePath}${listingQueryString(filters, defaults, {
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
  const formProps = {
    action: basePath,
    t,
    colorNames: dict.store.colors,
    genderNames: dict.store.genders,
    locale,
    filters,
    facets,
    options,
    clearHref,
    defaultSort: defaults.sort,
  }
  const outOfRange = listing.total > 0 && listing.items.length === 0
  const nothingFound = listing.total === 0

  return (
    <div className="container-luxe py-8 lg:py-12">
      {header}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-y border-line py-3">
        <p className="text-sm text-muted" aria-live="polite">
          {plural(locale, listing.total, t.resultCount)}
        </p>
        <div className="flex items-center gap-3">
          <FilterDrawer
            label={
              filterCount > 0 ? interpolate(t.filtersCount, { count: filterCount }) : t.filters
            }
            closeLabel={t.closeFilters}
            title={t.filters}
          >
            <FilterForm {...formProps} autoSubmit={false} />
          </FilterDrawer>
          <SortControl action={basePath} t={t} filters={filters} />
        </div>
      </div>

      <div className="mt-4">
        <ActiveFilters
          locale={locale}
          basePath={basePath}
          defaults={defaults}
          filters={filters}
          facets={facets}
          t={t}
          colorNames={dict.store.colors}
          genderNames={dict.store.genders}
        />
      </div>

      <div className="mt-6 grid gap-10 lg:grid-cols-[15rem_1fr] lg:gap-12">
        <aside className="hidden lg:block" aria-label={t.filters}>
          <FilterForm {...formProps} autoSubmit />
        </aside>
        <section aria-label={plural(locale, listing.total, t.resultCount)} className="min-w-0">
          {nothingFound ? (
            <div className="flex flex-col items-start gap-4 py-16" data-testid="listing-empty">
              <h2 className="font-display text-2xl text-ink">{t.emptyTitle}</h2>
              <p className="max-w-md text-muted">
                {filters.q ? interpolate(t.emptySearch, { query: filters.q }) : t.emptyText}
              </p>
              {filterCount > 0 ? (
                <ButtonLink href={clearHref as Route} variant="secondary">
                  {t.clearAll}
                </ButtonLink>
              ) : (
                <ButtonLink href={`/${locale}/shop`} variant="secondary">
                  {t.browseAll}
                </ButtonLink>
              )}
            </div>
          ) : outOfRange ? (
            <div className="flex flex-col items-start gap-4 py-16">
              <p className="text-muted">{t.pageOutOfRange}</p>
              <Link
                href={`${basePath}${listingQueryString(filters, defaults, { page: 1 })}` as Route}
                className="text-sm underline underline-offset-4"
              >
                {t.firstPage}
              </Link>
            </div>
          ) : (
            <>
              <ProductGrid
                locale={locale}
                products={listing.items}
                t={dict.store.card}
                priorityCount={4}
                actions={actions}
              />
              <div className="mt-14">
                <Pagination
                  locale={locale}
                  t={t}
                  label={dict.common.paginationLabel}
                  page={listing.page}
                  pageCount={listing.pageCount}
                  hrefForPage={(page) =>
                    `${basePath}${listingQueryString(filters, defaults, { page })}`
                  }
                />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
