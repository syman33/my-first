import { describe, expect, it } from 'vitest'
import ar from '@/i18n/dictionaries/ar'
import en from '@/i18n/dictionaries/en'
import { formatDate, formatMoney } from '@/i18n/format'
import { interpolate, plural } from '@/i18n'
import { ERROR_CODES } from '@/lib/errors'

const PLURAL_CATEGORIES = new Set(['zero', 'one', 'two', 'few', 'many', 'other'])

/** CLDR plural forms legitimately differ per language (Arabic has six, English two). */
function isPluralForms(value: object): boolean {
  const keys = Object.keys(value)
  return keys.includes('other') && keys.every((key) => PLURAL_CATEGORIES.has(key))
}

function leafPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  if (isPluralForms(value)) return [prefix]
  return Object.entries(value).flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k))
}

function pluralFormPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return []
  if (isPluralForms(value)) return [prefix]
  return Object.entries(value).flatMap(([k, v]) =>
    pluralFormPaths(v, prefix ? `${prefix}.${k}` : k),
  )
}

describe('dictionaries', () => {
  it('Arabic and English have identical keys', () => {
    expect(leafPaths(en).sort()).toEqual(leafPaths(ar).sort())
  })

  it('every error code has a localized message in both languages', () => {
    for (const code of ERROR_CODES) {
      expect(ar.errors.codes[code], `ar missing ${code}`).toBeTruthy()
      expect(en.errors.codes[code], `en missing ${code}`).toBeTruthy()
    }
  })

  it('Arabic plural forms cover every category Arabic uses', () => {
    for (const path of pluralFormPaths(ar)) {
      const forms = path
        .split('.')
        .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], ar) as Record<string, string>
      expect(Object.keys(forms).sort(), path).toEqual([
        'few',
        'many',
        'one',
        'other',
        'two',
        'zero',
      ])
    }
  })

  it('has no empty strings', () => {
    const empty = (dict: unknown) =>
      leafPaths(dict).filter((path) => {
        const v = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], dict)
        return typeof v === 'string' && v.trim() === ''
      })
    expect(empty(ar)).toEqual([])
    expect(empty(en)).toEqual([])
  })
})

describe('interpolate & plural', () => {
  it('replaces placeholders and leaves unknown ones visible', () => {
    expect(interpolate('Showing {from}–{to} of {total}', { from: 1, to: 24, total: 120 })).toBe(
      'Showing 1–24 of 120',
    )
    expect(interpolate('Hello {name}', {})).toBe('Hello {name}')
  })

  it('selects Arabic plural categories', () => {
    const forms = {
      zero: 'لا منتجات',
      one: 'منتج واحد',
      two: 'منتجان',
      few: '{count} منتجات',
      many: '{count} منتجاً',
      other: '{count} منتج',
    }
    expect(plural('ar', 0, forms)).toBe('لا منتجات')
    expect(plural('ar', 1, forms)).toBe('منتج واحد')
    expect(plural('ar', 2, forms)).toBe('منتجان')
    expect(plural('ar', 5, forms)).toBe('5 منتجات')
    expect(plural('ar', 11, forms)).toBe('11 منتجاً')
    expect(plural('ar', 100, forms)).toBe('100 منتج')
    expect(plural('en', 1, { one: '{count} item', other: '{count} items' })).toBe('1 item')
  })
})

describe('formatting', () => {
  it('formats SAR amounts per locale with Latin digits', () => {
    expect(formatMoney(29_950, 'ar')).toBe('299.50 ر.س')
    expect(formatMoney(29_950, 'en')).toBe('SAR 299.50')
    expect(formatMoney(123_456_789, 'en')).toBe('SAR 1,234,567.89')
    expect(formatMoney(30_000, 'en', { hideZeroFraction: true })).toBe('SAR 300')
    expect(formatMoney(-500, 'en')).toBe('SAR -5.00')
  })

  it('formats very large aggregates exactly', () => {
    // 9 trillion SAR (900,000,000,000,007 halalas): a magnitude where truncating a
    // fractional `amount / 100` float could round across an integer boundary.
    expect(formatMoney(900_000_000_000_007, 'en')).toBe('SAR 9,000,000,000,000.07')
    expect(formatMoney(Number.MAX_SAFE_INTEGER, 'en')).toBe('SAR 90,071,992,547,409.91')
  })

  it('renders dates in Asia/Riyadh with the Gregorian calendar', () => {
    const instant = new Date('2026-09-28T21:30:00Z') // 00:30 on 29 Sep in Riyadh
    expect(formatDate(instant, 'en', 'long')).toBe('29 September 2026')
    expect(formatDate(instant, 'ar', 'long')).toBe('29 سبتمبر 2026')
  })
})
