import ar, { type Dictionary } from './dictionaries/ar'
import en from './dictionaries/en'
import { type Locale } from './config'

export type { Dictionary }

const dictionaries: Record<Locale, Dictionary> = { ar, en }

/**
 * Dictionaries are plain typed objects bundled with the server. Pages pass
 * only the slices a Client Component needs, keeping client bundles small.
 */
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale]
}

/** Replace `{name}` placeholders. Unknown placeholders are left intact so gaps are visible. */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  )
}

export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }

const pluralRules = new Map<Locale, Intl.PluralRules>()

/**
 * CLDR plural selection. Arabic distinguishes zero/one/two/few/many/other,
 * so counts must never be glued onto a single word form.
 */
export function plural(locale: Locale, count: number, forms: PluralForms): string {
  let rules = pluralRules.get(locale)
  if (!rules) {
    rules = new Intl.PluralRules(locale === 'ar' ? 'ar' : 'en')
    pluralRules.set(locale, rules)
  }
  const form = forms[rules.select(count)] ?? forms.other
  return interpolate(form, { count })
}
