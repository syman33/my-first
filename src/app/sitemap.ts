import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo'
import { getSitemapEntries } from '@/services/catalog/sitemap.service'

// Generated per request from the database (never at build time).
export const dynamic = 'force-dynamic'

function pair(
  arPath: string,
  enPath: string,
  lastModified?: Date,
  priority?: number,
): MetadataRoute.Sitemap {
  const languages = { 'ar-SA': absoluteUrl(arPath), 'en-SA': absoluteUrl(enPath) }
  return [
    { url: absoluteUrl(arPath), lastModified, priority, alternates: { languages } },
    { url: absoluteUrl(enPath), lastModified, priority, alternates: { languages } },
  ]
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { categories, products, pages } = await getSitemapEntries()
  const encode = (slug: string) => encodeURIComponent(slug)
  return [
    ...pair('/ar', '/en', undefined, 1),
    ...pair('/ar/shop', '/en/shop', undefined, 0.8),
    ...pair('/ar/faq', '/en/faq', undefined, 0.3),
    ...pair('/ar/contact', '/en/contact', undefined, 0.3),
    ...categories.flatMap((c) =>
      pair(`/ar/${encode(c.slug)}`, `/en/${encode(c.slug)}`, c.updatedAt, 0.7),
    ),
    ...pages.flatMap((p) =>
      pair(`/ar/${encode(p.slug)}`, `/en/${encode(p.slug)}`, p.updatedAt, 0.3),
    ),
    ...products.flatMap((p) =>
      pair(`/ar/product/${encode(p.slugAr)}`, `/en/product/${encode(p.slugEn)}`, p.updatedAt, 0.6),
    ),
  ]
}
