/**
 * Locale configuration. Arabic (RTL) is the primary, default experience;
 * English (LTR) is secondary. Everything locale-dependent derives from here.
 */
export const locales = ['ar', 'en'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'ar'

/** Cookie remembering an explicit language choice made via the language switcher. */
export const LOCALE_COOKIE = 'velora_locale'

export const localeDirection: Record<Locale, 'rtl' | 'ltr'> = {
  ar: 'rtl',
  en: 'ltr',
}

/**
 * BCP-47 tags used with `Intl`. The explicit `ca-gregory` and `nu-latn`
 * extensions pin the Gregorian calendar and Latin digits: ICU defaults for
 * `ar-SA` differ between Node.js and browsers, which would otherwise cause
 * hydration mismatches and inconsistent invoices.
 */
export const intlLocale: Record<Locale, string> = {
  ar: 'ar-SA-u-ca-gregory-nu-latn',
  en: 'en-GB-u-ca-gregory-nu-latn',
}

/** `hreflang` / Open Graph locale values. */
export const htmlLang: Record<Locale, string> = { ar: 'ar-SA', en: 'en-SA' }
export const ogLocale: Record<Locale, string> = { ar: 'ar_SA', en: 'en_US' }

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value)
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'ar' ? 'en' : 'ar'
}

/** Pick a localized field pair, e.g. `localized(product, 'name', 'ar')` → `product.nameAr`. */
export function pickLocalized<K extends string>(
  record: { [P in `${K}Ar` | `${K}En`]: string | null },
  key: K,
  locale: Locale,
): string {
  const arabic = record[`${key}Ar`]
  const english = record[`${key}En`]
  return (locale === 'ar' ? arabic || english : english || arabic) || ''
}
