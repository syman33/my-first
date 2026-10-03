import 'server-only'
import { prisma } from '@/db/client'
import type { BannerPlacement } from '@/generated/prisma/enums'
import type { Locale } from '@/i18n/config'

export interface BannerView {
  id: string
  title: string
  subtitle: string | null
  ctaLabel: string | null
  href: string | null
  imageUrl: string
  mobileImageUrl: string | null
  alt: string
}

/** Same-site paths or https URLs only — banner links are admin input. */
export function safeBannerHref(url: string | null, locale: Locale): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    // Localise bare store paths ("/bags" → "/ar/bags").
    return /^\/(ar|en)(\/|$|\?)/.test(trimmed)
      ? trimmed
      : `/${locale}${trimmed === '/' ? '' : trimmed}`
  }
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

/** Banners that are switched on and inside their schedule window right now. */
export async function getActiveBanners(
  placement: BannerPlacement,
  locale: Locale,
  now: Date = new Date(),
): Promise<BannerView[]> {
  const rows = await prisma.banner.findMany({
    where: {
      placement,
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    take: placement === 'HERO' ? 3 : 6,
  })
  const ar = locale === 'ar'
  return rows.map((row) => ({
    id: row.id,
    title: ar ? row.titleAr : row.titleEn,
    subtitle: ar ? row.subtitleAr : row.subtitleEn,
    ctaLabel: ar ? row.ctaLabelAr : row.ctaLabelEn,
    href: safeBannerHref(row.linkUrl, locale),
    imageUrl: row.imageUrl,
    mobileImageUrl: row.mobileImageUrl,
    alt: (ar ? row.altAr : row.altEn) ?? '',
  }))
}
