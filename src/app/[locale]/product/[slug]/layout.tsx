import { notFound, permanentRedirect } from 'next/navigation'
import type { Route } from 'next'
import { isLocale } from '@/i18n/config'
import { getProductPage } from '@/services/catalog/product.service'

/**
 * Resolves the product before the page streams. The loading skeleton is a
 * Suspense boundary, and once streaming starts the status is fixed at 200:
 * checking here gives an unknown slug a real HTTP 404, and the other
 * language's slug a real 308 to this language's URL, for browsers and crawlers.
 */
export default async function ProductLayout({
  children,
  params,
}: LayoutProps<'/[locale]/product/[slug]'>) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  const lookup = await getProductPage(slug, locale)
  if (lookup.status === 'not_found') notFound()
  if (lookup.status === 'redirect') {
    permanentRedirect(`/${locale}/product/${encodeURIComponent(lookup.slug)}` as Route)
  }
  return children
}
