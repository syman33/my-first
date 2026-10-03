import { isLocale, type Locale } from '@/i18n/config'

/**
 * Same page in another language: swaps the leading locale segment and keeps
 * the rest of the path and query. Product pages accept either language's slug
 * and redirect to the canonical one, so this works everywhere.
 */
export function switchLocalePath(pathWithQuery: string, target: Locale): string {
  const [path = '/', query] = pathWithQuery.split('?', 2)
  const segments = path.split('/')
  if (isLocale(segments[1])) segments[1] = target
  else segments.splice(1, 0, target)
  const next = segments.join('/').replace(/\/$/, '') || `/${target}`
  return query ? `${next}?${query}` : next
}
