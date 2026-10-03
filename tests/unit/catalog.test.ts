import { describe, expect, it } from 'vitest'
import {
  activeFilterCount,
  listingQueryString,
  MAX_PAGE,
  parseListingParams,
} from '@/schemas/catalog'
import {
  availableUnits,
  effectivePrice,
  stockLevel,
  toProductCard,
  type CardSource,
} from '@/lib/catalog/presentation'
import { searchTermGroups } from '@/services/catalog/search-terms'

const defaults = { sort: 'featured' as const }

describe('parseListingParams', () => {
  it('parses repeated and comma-separated values', () => {
    const filters = parseListingParams(
      { color: ['black', 'gold,rose-gold'], gender: 'women', brand: 'maison-sahar' },
      defaults,
    )
    expect(filters.colors).toEqual(['BLACK', 'GOLD', 'ROSE_GOLD'])
    expect(filters.genders).toEqual(['WOMEN'])
    expect(filters.brands).toEqual(['maison-sahar'])
  })

  it('drops unknown values instead of failing', () => {
    const filters = parseListingParams(
      { color: ['plaid'], gender: 'robots', sort: 'cheapest', brand: '../etc/passwd' },
      defaults,
    )
    expect(filters).toMatchObject({ colors: [], genders: [], brands: [], sort: 'featured' })
  })

  it('converts riyal price bounds to halalas and orders them', () => {
    expect(parseListingParams({ min: '٥٠٠', max: '200' }, defaults)).toMatchObject({
      minPrice: 20_000,
      maxPrice: 50_000,
    })
    expect(parseListingParams({ min: '-5', max: '1.5' }, defaults)).toMatchObject({
      minPrice: null,
      maxPrice: null,
    })
  })

  it('clamps the page number', () => {
    expect(parseListingParams({ page: '0' }, defaults).page).toBe(1)
    expect(parseListingParams({ page: 'abc' }, defaults).page).toBe(1)
    expect(parseListingParams({ page: '999999' }, defaults).page).toBe(MAX_PAGE)
  })

  it('limits and trims the search query', () => {
    expect(parseListingParams({ q: `  ${'x'.repeat(300)}` }, defaults).q).toHaveLength(100)
    expect(parseListingParams({ q: '  حقيبة  ' }, defaults).q).toBe('حقيبة')
  })

  it('reads boolean flags', () => {
    expect(parseListingParams({ instock: '1', sale: 'on' }, defaults)).toMatchObject({
      inStock: true,
      onSale: true,
    })
    expect(parseListingParams({ instock: 'yes' }, defaults).inStock).toBe(false)
  })
})

describe('listingQueryString', () => {
  it('round-trips and omits defaults', () => {
    const filters = parseListingParams(
      { color: 'black', min: '100', instock: '1', sort: 'price-asc', page: '2' },
      defaults,
    )
    const query = listingQueryString(filters, defaults)
    expect(query).toBe('?color=black&min=100&instock=1&sort=price-asc&page=2')
    const reparsed = parseListingParams(Object.fromEntries(new URLSearchParams(query)), defaults)
    expect(reparsed).toEqual(filters)
  })

  it('applies overrides (e.g. reset to page 1 when sorting)', () => {
    const filters = parseListingParams({ page: '3' }, defaults)
    expect(listingQueryString(filters, defaults, { page: 1, sort: 'newest' })).toBe('?sort=newest')
    expect(listingQueryString(parseListingParams({}, defaults), defaults)).toBe('')
  })

  it('counts active filters', () => {
    const filters = parseListingParams(
      { color: ['black', 'gold'], min: '100', max: '900', sale: '1' },
      defaults,
    )
    expect(activeFilterCount(filters)).toBe(4)
  })
})

describe('searchTermGroups', () => {
  it('normalises Arabic spelling variants', () => {
    expect(searchTermGroups('حقيبة')[0]).toContain('حقيبه')
    expect(searchTermGroups('أحزمة')[0]).toContain('احزمه')
  })

  it('strips the definite article and adds synonyms', () => {
    const [group] = searchTermGroups('الشنطة')
    expect(group).toEqual(expect.arrayContaining(['الشنطه', 'شنطه', 'حقيبه']))
  })

  it('matches plurals through the stem', () => {
    expect(searchTermGroups('ساعة')[0]).toEqual(expect.arrayContaining(['ساعه', 'ساع', 'ساعات']))
  })

  it('handles English, SKUs and noise', () => {
    expect(searchTermGroups('Black  BAG!!')).toEqual([
      ['black'],
      expect.arrayContaining(['bag', 'bags', 'handbag']),
    ])
    expect(searchTermGroups('VLR-BAG-LUNA')).toEqual([['vlr-bag-luna']])
    expect(searchTermGroups('a % _ ')).toEqual([])
  })
})

describe('effectivePrice', () => {
  const product = { price: 100_000, compareAtPrice: 120_000 }

  it('inherits product price and compare-at', () => {
    expect(effectivePrice(product, { price: null, compareAtPrice: null })).toEqual({
      price: 100_000,
      compareAtPrice: 120_000,
    })
  })

  it('does not mix a variant price with the product compare-at', () => {
    expect(effectivePrice(product, { price: 130_000, compareAtPrice: null })).toEqual({
      price: 130_000,
      compareAtPrice: null,
    })
  })

  it('ignores compare-at prices that are not higher', () => {
    expect(
      effectivePrice({ price: 100_000, compareAtPrice: 90_000 }, null).compareAtPrice,
    ).toBeNull()
  })
})

describe('stock helpers', () => {
  it('never reports negative availability', () => {
    expect(availableUnits({ onHand: 2, reserved: 5, lowStockThreshold: null })).toBe(0)
    expect(availableUnits(null)).toBe(0)
  })

  it('classifies stock levels', () => {
    expect(stockLevel(0, 3)).toBe('out_of_stock')
    expect(stockLevel(3, 3)).toBe('low_stock')
    expect(stockLevel(4, 3)).toBe('in_stock')
  })
})

describe('toProductCard', () => {
  const base: CardSource = {
    id: 'p1',
    slugAr: 'حقيبة-لونا',
    slugEn: 'luna-shoulder-bag',
    nameAr: 'حقيبة لونا',
    nameEn: 'Luna Shoulder Bag',
    price: 129_000,
    compareAtPrice: null,
    isNewArrival: true,
    isBestseller: false,
    lowStockThreshold: 3,
    ratingAverage: 450,
    ratingCount: 4,
    category: { slug: 'bags', nameAr: 'الشنط', nameEn: 'Bags' },
    brand: { nameAr: 'فيلورا', nameEn: 'VÉLORA Atelier' },
    images: [
      { url: '/a.webp', altAr: 'أ', altEn: 'A' },
      { url: '/b.webp', altAr: null, altEn: null },
    ],
    variants: [
      {
        id: 'v1',
        isDefault: true,
        price: null,
        compareAtPrice: null,
        colorHex: '#111111',
        colorNameAr: 'أسود',
        colorNameEn: 'Black',
        inventory: { onHand: 5, reserved: 1, lowStockThreshold: null },
      },
      {
        id: 'v2',
        isDefault: false,
        price: 99_000,
        compareAtPrice: 129_000,
        colorHex: '#c8a27a',
        colorNameAr: 'بيج',
        colorNameEn: 'Beige',
        inventory: { onHand: 0, reserved: 0, lowStockThreshold: null },
      },
    ],
  }

  it('leads with the lowest variant price and its discount', () => {
    const card = toProductCard(base, 'en')
    expect(card).toMatchObject({
      price: 99_000,
      compareAtPrice: 129_000,
      priceFrom: true,
      discountPercent: 23,
      badge: { kind: 'sale', percent: 23 },
      stock: 'in_stock',
      rating: { average: 4.5, count: 4 },
      quickAddVariantId: null,
    })
    expect(card.href).toBe('/en/product/luna-shoulder-bag')
    expect(card.hoverImage).toEqual({ url: '/b.webp', alt: 'Luna Shoulder Bag' })
    expect(card.swatches).toEqual([
      { hex: '#111111', name: 'Black' },
      { hex: '#c8a27a', name: 'Beige' },
    ])
  })

  it('localises names and encodes Arabic slugs', () => {
    const card = toProductCard(base, 'ar')
    expect(card.name).toBe('حقيبة لونا')
    expect(card.href).toBe(`/ar/product/${encodeURIComponent('حقيبة-لونا')}`)
  })

  it('marks sold-out products and only offers quick add for a single sellable variant', () => {
    const soldOut = toProductCard(
      { ...base, variants: base.variants.map((v) => ({ ...v, inventory: null })) },
      'en',
    )
    expect(soldOut).toMatchObject({ stock: 'out_of_stock', badge: { kind: 'sold_out' } })

    const single = toProductCard({ ...base, variants: [base.variants[0]!] }, 'en')
    expect(single).toMatchObject({
      quickAddVariantId: 'v1',
      badge: { kind: 'new' },
      priceFrom: false,
    })
  })
})
