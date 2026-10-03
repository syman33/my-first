import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ListingHeader } from '@/components/catalog/listing-header'
import { ListingView } from '@/components/catalog/listing-view'
import { getDictionary } from '@/i18n'
import { isLocale, type Locale, pickLocalized } from '@/i18n/config'
import { metaDescription, openGraph, samePathAlternates } from '@/lib/seo'
import { activeFilterCount, parseListingParams, type SortOption } from '@/schemas/catalog'
import {
  type CategoryNode,
  categoryAncestry,
  childCategories,
  descendantIds,
  getActiveCategories,
} from '@/services/catalog/category.service'
import {
  getListingFacets,
  type ListingScope,
  listProducts,
} from '@/services/catalog/listing.service'
import { decodeSlugParam } from '@/utils/text'

function scopeFor(category: CategoryNode, categories: CategoryNode[]): ListingScope {
  switch (category.kind) {
    case 'STANDARD':
      return { kind: 'category', categoryIds: descendantIds(categories, category.id) }
    case 'GENDER':
      return { kind: 'gender', gender: category.gender === 'MEN' ? 'MEN' : 'WOMEN' }
    case 'NEW_ARRIVALS':
      return { kind: 'new-arrivals' }
    case 'BEST_SELLERS':
      return { kind: 'best-sellers' }
    case 'OFFERS':
      return { kind: 'offers' }
  }
}

function defaultSortFor(category: CategoryNode): SortOption {
  if (category.kind === 'NEW_ARRIVALS') return 'newest'
  if (category.kind === 'BEST_SELLERS') return 'best-selling'
  return 'featured'
}

async function resolve(rawSlug: string) {
  const slug = decodeSlugParam(rawSlug)
  if (!slug) return null
  const categories = await getActiveCategories()
  const category = categories.find((c) => c.slug === slug)
  return category ? { category, categories } : null
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<'/[locale]/[category]'>): Promise<Metadata> {
  const { locale, category: rawSlug } = await params
  if (!isLocale(locale)) return {}
  const resolved = await resolve(rawSlug)
  if (!resolved) return {}
  const { category } = resolved
  const filters = parseListingParams(await searchParams, { sort: defaultSortFor(category) })
  const name = pickLocalized(category, 'name', locale)
  const title = (locale === 'ar' ? category.seoTitleAr : category.seoTitleEn) ?? name
  const description = metaDescription(
    (locale === 'ar' ? category.seoDescriptionAr : category.seoDescriptionEn) ??
      pickLocalized(category, 'description', locale),
  )
  const refined =
    activeFilterCount(filters) > 0 || filters.sort !== defaultSortFor(category) || filters.q !== ''
  return {
    title,
    description,
    alternates: samePathAlternates(locale, `/${category.slug}`),
    // Filtered and re-sorted variants duplicate the category page.
    robots: refined ? { index: false, follow: true } : undefined,
    openGraph: openGraph(locale, { title, description, url: `/${locale}/${category.slug}` }),
  }
}

export default async function CategoryPage({
  params,
  searchParams,
}: PageProps<'/[locale]/[category]'>) {
  const { locale: rawLocale, category: rawSlug } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale: Locale = rawLocale
  const resolved = await resolve(rawSlug)
  if (!resolved) notFound()
  const { category, categories } = resolved

  const dict = getDictionary(locale)
  const defaults = { sort: defaultSortFor(category) }
  const filters = parseListingParams(await searchParams, defaults)
  const scope = scopeFor(category, categories)
  const [listing, facets] = await Promise.all([
    listProducts(scope, filters, locale),
    getListingFacets(scope, filters.q),
  ])

  const basePath = `/${locale}/${encodeURIComponent(category.slug)}`
  const children = childCategories(categories, category.id)
  const crumbs = [
    { name: dict.common.home, href: `/${locale}` },
    ...categoryAncestry(categories, category.id).map((c) => ({
      name: pickLocalized(c, 'name', locale),
      href: `/${locale}/${encodeURIComponent(c.slug)}`,
    })),
  ]

  return (
    <ListingView
      locale={locale}
      dict={dict}
      basePath={basePath}
      defaults={defaults}
      filters={filters}
      listing={listing}
      facets={facets}
      options={{
        showCategories: category.kind !== 'STANDARD',
        showGenders: category.kind !== 'GENDER',
        showSale: category.kind !== 'OFFERS',
      }}
      header={
        <ListingHeader
          locale={locale}
          breadcrumbLabel={dict.store.product.breadcrumb}
          crumbs={crumbs}
          title={pickLocalized(category, 'name', locale)}
          description={pickLocalized(category, 'description', locale)}
          links={{
            label: dict.store.listing.subcategories,
            items: children.map((child) => ({
              href: `/${locale}/${encodeURIComponent(child.slug)}`,
              name: pickLocalized(child, 'name', locale),
            })),
          }}
        />
      }
    />
  )
}
