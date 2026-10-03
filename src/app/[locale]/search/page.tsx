import type { Metadata } from 'next'
import Form from 'next/form'
import { notFound } from 'next/navigation'
import { Search } from 'lucide-react'
import { ListingView } from '@/components/catalog/listing-view'
import { ProductGrid } from '@/components/catalog/product-grid'
import { getDictionary, interpolate } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { parseListingParams } from '@/schemas/catalog'
import { getListingFacets, listProducts, productRail } from '@/services/catalog/listing.service'

const defaults = { sort: 'best-selling' as const }

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<'/[locale]/search'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = getDictionary(locale).store.listing
  const { q } = parseListingParams(await searchParams, defaults)
  return {
    title: q ? interpolate(t.searchResultsFor, { query: q }) : t.searchTitle,
    // Search result pages are thin, unbounded duplicates of catalogue pages.
    robots: { index: false, follow: true },
  }
}

export default async function SearchPage({ params, searchParams }: PageProps<'/[locale]/search'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const dict = getDictionary(locale)
  const t = dict.store.listing
  const filters = parseListingParams(await searchParams, defaults)

  const searchBox = (
    <header>
      <h1 className="font-display text-4xl text-ink md:text-5xl">
        {filters.q ? interpolate(t.searchResultsFor, { query: filters.q }) : t.searchTitle}
      </h1>
      <Form
        action={`/${locale}/search`}
        role="search"
        className="mt-6 flex max-w-xl items-center border-b border-ink"
      >
        <label htmlFor="search-page-input" className="sr-only">
          {t.searchLabel}
        </label>
        <input
          id="search-page-input"
          name="q"
          type="search"
          defaultValue={filters.q}
          placeholder={dict.nav.searchPlaceholder}
          maxLength={100}
          className="h-12 flex-1 bg-transparent text-lg placeholder:text-muted-decorative focus:outline-none"
          autoFocus={!filters.q}
        />
        <button
          type="submit"
          className="inline-flex size-12 items-center justify-center"
          aria-label={dict.nav.search}
        >
          <Search className="size-5" aria-hidden="true" />
        </button>
      </Form>
    </header>
  )

  if (!filters.q) {
    const popular = await productRail({ kind: 'all' }, 'best-selling', locale, { take: 8 })
    return (
      <div className="container-luxe py-8 lg:py-12">
        {searchBox}
        <p className="mt-6 text-muted">{t.searchPrompt}</p>
        {popular.length > 0 ? (
          <section aria-labelledby="popular-title" className="mt-14">
            <h2 id="popular-title" className="mb-8 font-display text-2xl text-ink">
              {dict.store.home.bestSellers}
            </h2>
            <ProductGrid locale={locale} products={popular} t={dict.store.card} />
          </section>
        ) : null}
      </div>
    )
  }

  const scope = { kind: 'all' } as const
  const [listing, facets] = await Promise.all([
    listProducts(scope, filters, locale),
    getListingFacets(scope, filters.q),
  ])
  return (
    <ListingView
      locale={locale}
      dict={dict}
      basePath={`/${locale}/search`}
      defaults={defaults}
      filters={filters}
      listing={listing}
      facets={facets}
      options={{ showCategories: true, showGenders: true, showSale: true }}
      header={searchBox}
    />
  )
}
