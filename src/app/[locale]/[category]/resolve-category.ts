import { getActiveCategories } from '@/services/catalog/category.service'
import { decodeSlugParam } from '@/utils/text'

/** The active category for a URL slug (request-cached: the layout and the page share it). */
export async function resolveCategory(rawSlug: string) {
  const slug = decodeSlugParam(rawSlug)
  if (!slug) return null
  const categories = await getActiveCategories()
  const category = categories.find((c) => c.slug === slug)
  return category ? { category, categories } : null
}
