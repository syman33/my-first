import type { Metadata } from 'next'
import { type Locale, locales, ogLocale } from '@/i18n/config'

/** Public origin for absolute URLs (canonical, sitemap, structured data). */
export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

export function absoluteUrl(path: string): string {
  return `${siteOrigin()}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Canonical + hreflang alternates for a page that exists in both languages.
 * `paths` maps each locale to its own path (product slugs differ per language).
 */
export function localizedAlternates(
  locale: Locale,
  paths: Record<Locale, string>,
): Metadata['alternates'] {
  return {
    canonical: paths[locale],
    languages: {
      ...Object.fromEntries(locales.map((l) => [l === 'ar' ? 'ar-SA' : 'en-SA', paths[l]])),
      'x-default': paths.ar,
    },
  }
}

export function samePathAlternates(
  locale: Locale,
  pathWithoutLocale: string,
): Metadata['alternates'] {
  const suffix = pathWithoutLocale === '/' ? '' : pathWithoutLocale
  return localizedAlternates(locale, { ar: `/ar${suffix}`, en: `/en${suffix}` })
}

export function openGraph(
  locale: Locale,
  input: {
    title: string
    description?: string
    url: string
    images?: { url: string; alt?: string }[]
  },
): Metadata['openGraph'] {
  return {
    type: 'website',
    siteName: 'VÉLORA',
    locale: ogLocale[locale],
    alternateLocale: ogLocale[locale === 'ar' ? 'en' : 'ar'],
    title: input.title,
    description: input.description,
    url: input.url,
    images: input.images?.length ? input.images : [{ url: '/brand/og-default.png', alt: 'VÉLORA' }],
  }
}

/** Trim to a meta-description-friendly length on a word boundary. */
export function metaDescription(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}
