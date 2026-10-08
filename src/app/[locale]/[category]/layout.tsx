import { notFound } from 'next/navigation'
import { isLocale } from '@/i18n/config'
import { resolveCategory } from './resolve-category'

/**
 * Resolves the category before the page streams. The loading skeleton is a
 * Suspense boundary, and once streaming starts the status is fixed at 200:
 * checking here gives an unknown slug a real HTTP 404 instead of a soft 404.
 */
export default async function CategoryLayout({
  children,
  params,
}: LayoutProps<'/[locale]/[category]'>) {
  const { locale, category } = await params
  if (!isLocale(locale) || !(await resolveCategory(category))) notFound()
  return children
}
