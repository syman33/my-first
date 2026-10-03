/**
 * Text normalisation for search and URLs (pure, shared by server and seed).
 */

// Arabic diacritics (tashkeel), superscript alef, Quranic marks, and tatweel.
const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g
const LATIN_COMBINING = /[̀-ͯ]/g

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩'
const EASTERN_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹'

function toLatinDigits(input: string): string {
  let out = ''
  for (const ch of input) {
    const a = ARABIC_INDIC.indexOf(ch)
    const e = EASTERN_ARABIC_INDIC.indexOf(ch)
    out += a >= 0 ? String(a) : e >= 0 ? String(e) : ch
  }
  return out
}

/**
 * Normalise text for matching: users type Arabic with or without hamza,
 * diacritics or ta marbuta, and Latin brand names with or without accents
 * ("Élan" / "elan"). Both the stored search document and the query go
 * through this same function.
 */
export function normalizeForSearch(input: string): string {
  return toLatinDigits(input)
    .normalize('NFKD')
    .replace(LATIN_COMBINING, '')
    .replace(ARABIC_MARKS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Build the denormalised search document stored on a product. */
export function buildSearchDocument(parts: Array<string | null | undefined>): string {
  const tokens = new Set<string>()
  for (const part of parts) {
    if (!part) continue
    for (const token of normalizeForSearch(part).split(' ')) {
      if (token) tokens.add(token)
    }
  }
  return [...tokens].join(' ')
}

/**
 * URL slug. Keeps Arabic letters (modern browsers and search engines handle
 * UTF-8 paths; they are percent-encoded on the wire), drops diacritics and
 * punctuation, and joins words with hyphens.
 */
export function slugify(input: string): string {
  return (
    toLatinDigits(input)
      .normalize('NFKD')
      .replace(LATIN_COMBINING, '')
      // Re-compose so Arabic hamza forms (إ أ آ ؤ ئ) survive as letters; only tashkeel is dropped.
      .normalize('NFC')
      .replace(ARABIC_MARKS, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 180)
  )
}

/** Slugs are validated against this pattern wherever they are accepted as input. */
export const SLUG_PATTERN = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 180 && SLUG_PATTERN.test(slug)
}

/** Escape LIKE/ILIKE wildcards so user input is matched literally. */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}
