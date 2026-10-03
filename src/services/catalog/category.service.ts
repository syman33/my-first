import 'server-only'
import { cache } from 'react'
import { prisma } from '@/db/client'
import type { CategoryKind, Gender } from '@/generated/prisma/enums'

export interface CategoryNode {
  id: string
  slug: string
  nameAr: string
  nameEn: string
  descriptionAr: string | null
  descriptionEn: string | null
  imageUrl: string | null
  kind: CategoryKind
  gender: Gender | null
  parentId: string | null
  sortOrder: number
  seoTitleAr: string | null
  seoTitleEn: string | null
  seoDescriptionAr: string | null
  seoDescriptionEn: string | null
  updatedAt: Date
}

/**
 * Static storefront routes. A category with one of these slugs would be
 * shadowed by the route, so category creation must reject them.
 */
export const RESERVED_CATEGORY_SLUGS = new Set([
  'account',
  'admin',
  'api',
  'about',
  'cart',
  'checkout',
  'contact',
  'faq',
  'forgot-password',
  'login',
  'newsletter',
  'order',
  'orders',
  'pages',
  'privacy',
  'product',
  'products',
  'register',
  'reset-password',
  'returns',
  'search',
  'shipping',
  'shop',
  'terms',
  'verify-email',
  'wishlist',
])

/** All active categories (a small table), memoised per request. */
export const getActiveCategories = cache(async (): Promise<CategoryNode[]> =>
  prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
    select: {
      id: true,
      slug: true,
      nameAr: true,
      nameEn: true,
      descriptionAr: true,
      descriptionEn: true,
      imageUrl: true,
      kind: true,
      gender: true,
      parentId: true,
      sortOrder: true,
      seoTitleAr: true,
      seoTitleEn: true,
      seoDescriptionAr: true,
      seoDescriptionEn: true,
      updatedAt: true,
    },
  }),
)

/** The category and every active descendant (products may sit at any depth). */
export function descendantIds(categories: readonly CategoryNode[], rootId: string): string[] {
  const children = new Map<string, string[]>()
  for (const category of categories) {
    if (!category.parentId) continue
    children.set(category.parentId, [...(children.get(category.parentId) ?? []), category.id])
  }
  const out: string[] = []
  const queue = [rootId]
  const seen = new Set<string>()
  while (queue.length > 0) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
    queue.push(...(children.get(id) ?? []))
  }
  return out
}

/** Root-first chain for breadcrumbs, e.g. Accessories › Wallets. */
export function categoryAncestry(categories: readonly CategoryNode[], id: string): CategoryNode[] {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const chain: CategoryNode[] = []
  let current = byId.get(id)
  while (current && chain.length < 10) {
    chain.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return chain
}

export async function getCategoryBySlug(slug: string): Promise<CategoryNode | null> {
  const categories = await getActiveCategories()
  return categories.find((category) => category.slug === slug) ?? null
}

export function childCategories(
  categories: readonly CategoryNode[],
  parentId: string,
): CategoryNode[] {
  return categories.filter((category) => category.parentId === parentId)
}

/** Category ids (with descendants) for a list of slugs, ignoring unknown slugs. */
export function categoryIdsForSlugs(
  categories: readonly CategoryNode[],
  slugs: readonly string[],
): string[] {
  const ids = new Set<string>()
  for (const slug of slugs) {
    const category = categories.find((c) => c.slug === slug && c.kind === 'STANDARD')
    if (category) for (const id of descendantIds(categories, category.id)) ids.add(id)
  }
  return [...ids]
}
