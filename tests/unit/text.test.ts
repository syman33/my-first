import { describe, expect, it } from 'vitest'
import { buildSearchDocument, escapeLikePattern, isValidSlug, normalizeForSearch, slugify } from '@/utils/text'

describe('normalizeForSearch', () => {
  it('unifies Arabic letter variants so spelling differences still match', () => {
    expect(normalizeForSearch('أناقة')).toBe(normalizeForSearch('اناقه'))
    expect(normalizeForSearch('إكسسوارات')).toBe('اكسسوارات')
    expect(normalizeForSearch('مُسْتَشْفَى')).toBe('مستشفي')
    expect(normalizeForSearch('ساعـــة')).toBe('ساعه') // tatweel removed
  })

  it('folds Latin accents and case', () => {
    expect(normalizeForSearch('Élan Watch')).toBe('elan watch')
    expect(normalizeForSearch('LUMIÈRE')).toBe('lumiere')
  })

  it('converts Arabic-Indic digits and keeps SKUs searchable', () => {
    expect(normalizeForSearch('VLR-BAG-٠٠١')).toBe('vlr-bag-001')
  })

  it('strips punctuation and collapses whitespace', () => {
    expect(normalizeForSearch('  Luna,  shoulder   bag! ')).toBe('luna shoulder bag')
  })
})

describe('buildSearchDocument', () => {
  it('deduplicates normalised tokens across languages', () => {
    const doc = buildSearchDocument(['حقيبة لونا', 'Luna Bag', 'luna', null, 'VLR-BAG-001'])
    expect(doc.split(' ')).toEqual(['حقيبه', 'لونا', 'luna', 'bag', 'vlr-bag-001'])
  })
})

describe('slugify', () => {
  it('creates readable English slugs', () => {
    expect(slugify('Luna Shoulder Bag')).toBe('luna-shoulder-bag')
    expect(slugify('Élan Watch — Rose Gold')).toBe('elan-watch-rose-gold')
  })

  it('keeps Arabic letters and drops diacritics', () => {
    expect(slugify('حقيبة لونا الكتفية')).toBe('حقيبة-لونا-الكتفية')
    expect(slugify('ساعةُ إيلان')).toBe('ساعة-إيلان')
  })

  it('produces valid slugs', () => {
    for (const name of ['Luna Shoulder Bag', 'حقيبة لونا الكتفية', 'A & B', '١٢٣ test']) {
      expect(isValidSlug(slugify(name))).toBe(true)
    }
    expect(isValidSlug('bad slug')).toBe(false)
    expect(isValidSlug('-bad')).toBe(false)
    expect(isValidSlug('../etc')).toBe(false)
  })
})

describe('escapeLikePattern', () => {
  it('escapes wildcards', () => {
    expect(escapeLikePattern('50%_off\\')).toBe('50\\%\\_off\\\\')
  })
})
