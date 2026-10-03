import { describe, expect, it } from 'vitest'
import { pageWindow } from '@/components/catalog/pagination'
import { serializeJsonLd } from '@/components/seo/json-ld'
import { localizedAlternates, metaDescription } from '@/lib/seo'
import {
  type CategoryNode,
  categoryAncestry,
  categoryIdsForSlugs,
  descendantIds,
  RESERVED_CATEGORY_SLUGS,
} from '@/services/catalog/category.service'
import { categories as seedCategories } from '../../prisma/seed/data/catalog'
import { decodeSlugParam } from '@/utils/text'

function node(
  id: string,
  slug: string,
  parentId: string | null,
  kind: CategoryNode['kind'] = 'STANDARD',
): CategoryNode {
  return {
    id,
    slug,
    nameAr: slug,
    nameEn: slug,
    descriptionAr: null,
    descriptionEn: null,
    imageUrl: null,
    kind,
    gender: null,
    parentId,
    sortOrder: 0,
    seoTitleAr: null,
    seoTitleEn: null,
    seoDescriptionAr: null,
    seoDescriptionEn: null,
    updatedAt: new Date(0),
  }
}

const tree = [
  node('acc', 'accessories', null),
  node('wal', 'wallets', 'acc'),
  node('card', 'card-holders', 'wal'),
  node('bags', 'bags', null),
  node('women', 'women', null, 'GENDER'),
]

describe('category tree', () => {
  it('collects every descendant', () => {
    expect(descendantIds(tree, 'acc').sort()).toEqual(['acc', 'card', 'wal'])
    expect(descendantIds(tree, 'bags')).toEqual(['bags'])
  })

  it('builds a root-first ancestry for breadcrumbs', () => {
    expect(categoryAncestry(tree, 'card').map((c) => c.slug)).toEqual([
      'accessories',
      'wallets',
      'card-holders',
    ])
  })

  it('resolves slugs to ids, ignoring unknown and non-standard categories', () => {
    expect(categoryIdsForSlugs(tree, ['wallets', 'women', 'nope']).sort()).toEqual(['card', 'wal'])
  })

  it('survives cycles in corrupted data', () => {
    const cyclic = [node('a', 'a', 'b'), node('b', 'b', 'a')]
    expect(descendantIds(cyclic, 'a').sort()).toEqual(['a', 'b'])
    expect(categoryAncestry(cyclic, 'a').length).toBeLessThanOrEqual(10)
  })

  it('no seeded category collides with a storefront route', () => {
    for (const category of seedCategories)
      expect(RESERVED_CATEGORY_SLUGS.has(category.slug)).toBe(false)
  })
})

describe('pageWindow', () => {
  it('shows first, last and neighbours with gaps', () => {
    expect(pageWindow(1, 1)).toEqual([1])
    expect(pageWindow(1, 3)).toEqual([1, 2, 3])
    expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10])
    expect(pageWindow(10, 10)).toEqual([1, null, 9, 10])
  })
})

describe('serializeJsonLd', () => {
  it('cannot break out of the script element', () => {
    const out = serializeJsonLd({ name: '</script><script>alert(1)</script>', note: 'a & b  ' })
    expect(out).not.toContain('<')
    expect(out).not.toContain('>')
    expect(out).not.toContain(' ')
    expect(JSON.parse(out)).toEqual({ name: '</script><script>alert(1)</script>', note: 'a & b  ' })
  })
})

describe('SEO helpers', () => {
  it('builds canonical and hreflang alternates', () => {
    expect(localizedAlternates('en', { ar: '/ar/product/حقيبة', en: '/en/product/bag' })).toEqual({
      canonical: '/en/product/bag',
      languages: {
        'ar-SA': '/ar/product/حقيبة',
        'en-SA': '/en/product/bag',
        'x-default': '/ar/product/حقيبة',
      },
    })
  })

  it('shortens descriptions on a word boundary', () => {
    expect(metaDescription('short text')).toBe('short text')
    const long = metaDescription('word '.repeat(60), 40)
    expect(long.length).toBeLessThanOrEqual(40)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('decodeSlugParam', () => {
  it('decodes Arabic slugs and is idempotent', () => {
    const slug = 'حقيبة-لونا'
    expect(decodeSlugParam(encodeURIComponent(slug))).toBe(slug)
    expect(decodeSlugParam(slug)).toBe(slug)
  })

  it('rejects malformed input', () => {
    expect(decodeSlugParam('%E0%A4%A')).toBeNull()
    expect(decodeSlugParam('')).toBeNull()
  })
})
