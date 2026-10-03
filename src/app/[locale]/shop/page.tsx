import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ListingHeader } from '@/components/catalog/listing-header'
import { ListingView } from '@/components/catalog/listing-view'
import { getDictionary } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { openGraph, samePathAlternates } from '@/lib/seo'
import { activeFilterCount, parseListingParams } from '@/schemas/catalog'
import { getListingFacets, listProducts } from '@/services/catalog/listing.service'

const defaults = { sort: 'featured' as const }

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<'/[locale]/shop'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = getDictionary(locale).store.listing
  const filters = parseListingParams(await searchParams, defaults)
  const refined = activeFilterCount(filters) > 0 || filters.sort !== defaults.sort
  return {
    title: t.shopTitle,
    description: t.shopDescription,
    alternates: samePathAlternates(locale, '/shop'),
    robots: refined ? { index: false, follow: true } : undefined,
    openGraph: openGraph(locale, {
      title: t.shopTitle,
      description: t.shopDescription,
      url: `/${locale}/shop`,
    }),
  }
}

export default async function ShopPage({ params, searchParams }: PageProps<'/[locale]/shop'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const dict = getDictionary(locale)
  const filters = { ...parseListingParams(await searchParams, defaults), q: '' }
  const scope = { kind: 'all' } as const
  const [listing, facets] = await Promise.all([
    listProducts(scope, filters, locale),
    getListingFacets(scope, ''),
  ])
  return (
    <ListingView
      locale={locale}
      dict={dict}
      basePath={`/${locale}/shop`}
      defaults={defaults}
      filters={filters}
      listing={listing}
      facets={facets}
      options={{ showCategories: true, showGenders: true, showSale: true }}
      header={
        <ListingHeader
          locale={locale}
          breadcrumbLabel={dict.store.product.breadcrumb}
          crumbs={[
            { name: dict.common.home, href: `/${locale}` },
            { name: dict.store.listing.shopTitle, href: `/${locale}/shop` },
          ]}
          title={dict.store.listing.shopTitle}
          description={dict.store.listing.shopDescription}
        />
      }
    />
  )
}
