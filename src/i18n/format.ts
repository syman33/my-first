import { type Halalas, assertHalalas } from '@/utils/money'
import { STORE_TIME_ZONE } from '@/utils/time'
import { type Locale, intlLocale } from './config'

/**
 * Locale-aware display formatting. Pure and deterministic (explicit calendar,
 * digits and time zone), safe to use on both server and client.
 * Display only — never parse these strings back into amounts.
 */

const numberFormatters = new Map<string, Intl.NumberFormat>()
function numberFormat(locale: Locale, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}:${JSON.stringify(options)}`
  let f = numberFormatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat(intlLocale[locale], options)
    numberFormatters.set(key, f)
  }
  return f
}

const CURRENCY_LABEL: Record<Locale, string> = { ar: 'ر.س', en: 'SAR' }

/**
 * 29950 → "299.50 ر.س" (ar) / "SAR 299.50" (en).
 * Splits integer halalas exactly (`%` and division of an exact multiple of 100
 * are lossless for safe integers), so display never goes through a lossy
 * fractional float such as `amount / 100`.
 */
export function formatMoney(
  amount: Halalas,
  locale: Locale,
  options: { hideZeroFraction?: boolean } = {},
): string {
  assertHalalas(amount)
  const negative = amount < 0
  const abs = Math.abs(amount)
  const fraction = abs % 100
  const whole = (abs - fraction) / 100
  const wholeText = numberFormat(locale, { maximumFractionDigits: 0, useGrouping: true }).format(
    whole,
  )
  const fractionText =
    options.hideZeroFraction && fraction === 0 ? '' : `.${String(fraction).padStart(2, '0')}`
  const number = `${negative ? '-' : ''}${wholeText}${fractionText}`
  return locale === 'ar' ? `${number} ${CURRENCY_LABEL.ar}` : `${CURRENCY_LABEL.en} ${number}`
}

export function formatNumber(value: number, locale: Locale): string {
  return numberFormat(locale, { maximumFractionDigits: 2 }).format(value)
}

/** 1500 bps → "15%" */
export function formatBasisPoints(bps: number, locale: Locale): string {
  return numberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(bps / 10_000)
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>()
function dateFormat(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`
  let f = dateFormatters.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(intlLocale[locale], { timeZone: STORE_TIME_ZONE, ...options })
    dateFormatters.set(key, f)
  }
  return f
}

export function formatDate(
  date: Date | string,
  locale: Locale,
  style: 'short' | 'medium' | 'long' = 'medium',
): string {
  return dateFormat(locale, { dateStyle: style }).format(new Date(date))
}

export function formatDateTime(date: Date | string, locale: Locale): string {
  return dateFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
}

/** Short "28 Sep" style label used on chart axes. */
export function formatDayLabel(date: Date | string, locale: Locale): string {
  return dateFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(date))
}

/** Signed change in basis points: 1250 → "+12.5%", -300 → "−3%" (locale digits and signs). */
export function formatSignedPercent(bps: number, locale: Locale): string {
  return numberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  }).format(bps / 10_000)
}

/** "Sun, 28 Sep" style label for tooltips and tables. */
export function formatDayFull(date: Date | string, locale: Locale): string {
  return dateFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(
    new Date(date),
  )
}

/** Compact counts for tiles: 1,284 / 12.9K. */
export function formatCompactNumber(value: number, locale: Locale): string {
  return numberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}
