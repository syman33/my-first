import { normalizeForSearch } from '@/utils/text'

/**
 * Turn a shopper's query into match groups for the product search document.
 * Every group must match (AND); any alternative inside a group may match (OR).
 *
 * Arabic shoppers write the same word many ways, so beyond the shared
 * normalisation (hamza, ta marbuta, diacritics) each token also tries:
 *   - without the definite article: "الحقيبه" → "حقيبه"
 *   - without a final ta marbuta/ha: "ساعه" → "ساع" (matches "ساعات")
 *   - a few everyday synonyms: "شنطه" ↔ "حقيبه"
 * Matching is substring-based (trigram-indexed ILIKE), so prefixes work.
 */

const MAX_TOKENS = 6
const MIN_TOKEN_LENGTH = 2

/** Normalised forms only (see normalizeForSearch). */
const SYNONYM_GROUPS: string[][] = [
  ['شنطه', 'شنط', 'حقيبه', 'حقائب', 'شنطة'],
  ['ساعه', 'ساعات'],
  ['محفظه', 'محافظ'],
  ['حزام', 'احزمه'],
  ['نظاره', 'نظارات', 'نظارة'],
  ['bag', 'bags', 'handbag', 'purse'],
  ['watch', 'watches', 'timepiece'],
  ['wallet', 'wallets', 'cardholder'],
  ['belt', 'belts'],
  ['sunglasses', 'shades', 'eyewear'],
]

const SYNONYMS = new Map<string, string[]>()
for (const group of SYNONYM_GROUPS) {
  const normalized = group.map((word) => normalizeForSearch(word))
  for (const word of normalized) SYNONYMS.set(word, normalized)
}

const ARABIC_LETTER = /\p{Script=Arabic}/u

function variantsOf(token: string): string[] {
  const out = new Set([token])
  if (ARABIC_LETTER.test(token)) {
    if (token.startsWith('ال') && token.length >= 4) out.add(token.slice(2))
    for (const form of [...out]) {
      if (form.endsWith('ه') && form.length >= 4) out.add(form.slice(0, -1))
    }
  }
  for (const form of [...out]) {
    for (const synonym of SYNONYMS.get(form) ?? []) out.add(synonym)
  }
  return [...out]
}

export function searchTermGroups(query: string): string[][] {
  const tokens = [...new Set(normalizeForSearch(query).split(' '))].filter(
    (token) => token.length >= MIN_TOKEN_LENGTH,
  )
  return tokens.slice(0, MAX_TOKENS).map(variantsOf)
}
