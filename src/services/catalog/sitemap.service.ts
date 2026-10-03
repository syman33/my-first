import 'server-only'
import { prisma } from '@/db/client'
import { visibleProductWhere } from './listing.service'

/** Everything public and indexable, for the XML sitemap. */
export async function getSitemapEntries(now: Date = new Date()) {
  const [categories, products, pages] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      select: { slug: true, updatedAt: true },
    }),
    prisma.product.findMany({
      where: visibleProductWhere(now),
      select: { slugAr: true, slugEn: true, updatedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 45_000, // Sitemaps hold at most 50,000 URLs.
    }),
    prisma.page.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true } }),
  ])
  return { categories, products, pages }
}
