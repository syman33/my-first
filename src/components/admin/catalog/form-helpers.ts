import { ApiClientError } from '@/lib/client/api'
import { halalasToSarString, sarToHalalas } from '@/utils/money'

/** Helpers shared by the catalogue forms (money and numbers are typed as text, sent as integers). */

export function moneyToInput(value: number | null): string {
  return value === null ? '' : halalasToSarString(value)
}

/** SAR text → halalas; '' → null; invalid → undefined (the caller shows the field error). */
export function inputToMoney(value: string): number | null | undefined {
  if (value.trim() === '') return null
  try {
    const halalas = sarToHalalas(value)
    return halalas >= 0 ? halalas : undefined
  } catch {
    return undefined
  }
}

/** Whole-number text → number; '' → null; invalid → undefined. */
export function inputToInt(value: string): number | null | undefined {
  const text = value.trim()
  if (text === '') return null
  return /^\d{1,9}$/.test(text) ? Number(text) : undefined
}

/**
 * Server field errors arrive keyed by the API's paths (e.g. `product.slugAr`);
 * strip known prefixes so they land on the form's own field names.
 */
export function fieldErrorsFrom(error: unknown, prefixes: string[] = []): Record<string, string> {
  if (!(error instanceof ApiClientError)) return {}
  const out: Record<string, string> = {}
  for (const [key, message] of Object.entries(error.fieldErrors)) {
    const prefix = prefixes.find((candidate) => key.startsWith(`${candidate}.`))
    out[prefix ? key.slice(prefix.length + 1) : key] = message
  }
  return out
}
