import { z } from 'zod'
import { parseStoreDateKey } from '@/utils/time'

/**
 * Parsing of admin list URLs (`?q=…&status=…&page=…`). Anything malformed
 * falls back to a safe default instead of erroring: these are bookmarkable
 * GET URLs, not API input.
 */

export type SearchParamsRecord = Record<string, string | string[] | undefined>

export function firstParam(params: SearchParamsRecord, key: string): string | undefined {
  const value = params[key]
  const first = Array.isArray(value) ? value[0] : value
  const trimmed = first?.trim()
  return trimmed ? trimmed : undefined
}

export function pageParam(params: SearchParamsRecord): number {
  const parsed = z.coerce.number().int().min(1).max(10_000).safeParse(firstParam(params, 'page'))
  return parsed.success ? parsed.data : 1
}

/** Free-text search, bounded so it can never become an expensive query. */
export function searchParam(params: SearchParamsRecord, key = 'q'): string | undefined {
  return firstParam(params, key)?.slice(0, 100)
}

export function enumParam<const T extends readonly string[]>(
  params: SearchParamsRecord,
  key: string,
  values: T,
): T[number] | undefined {
  const value = firstParam(params, key)
  return value && (values as readonly string[]).includes(value) ? (value as T[number]) : undefined
}

/** `YYYY-MM-DD` → the start of that day in the store's time zone, or undefined. */
export function dateParam(params: SearchParamsRecord, key: string): Date | undefined {
  const value = firstParam(params, key)
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  try {
    return parseStoreDateKey(value)
  } catch {
    return undefined
  }
}

/** Rebuild a list URL with some parameters changed (undefined removes one). */
export function listHref(
  pathname: string,
  params: SearchParamsRecord,
  changes: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value
    if (first) search.set(key, first)
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '') search.delete(key)
    else search.set(key, String(value))
  }
  if (search.get('page') === '1') search.delete('page')
  const query = search.toString()
  return query ? `${pathname}?${query}` : pathname
}

export const ADMIN_PAGE_SIZE = 25
