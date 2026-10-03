/**
 * Policy pages and FAQ answers reference live settings with {{tokens}} so the
 * text never contradicts configuration. Pure, so the admin preview can render
 * exactly what customers will see.
 */
export const PAGE_TOKENS = [
  'standardFee',
  'expressFee',
  'freeShippingThreshold',
  'codFee',
  'returnWindowDays',
  'standardDays',
  'expressDays',
] as const
export type PageToken = (typeof PAGE_TOKENS)[number]

export function renderPageTokens(content: string, values: Record<PageToken, string>): string {
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    (PAGE_TOKENS as readonly string[]).includes(key) ? values[key as PageToken] : match,
  )
}
