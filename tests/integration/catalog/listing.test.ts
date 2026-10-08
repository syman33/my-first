import { describe, expect, it } from 'vitest'
import { prisma } from '@/db/client'
import { parseListingParams, PAGE_SIZE, type SortOption } from '@/schemas/catalog'
import {
  getListingFacets,
  type ListingScope,
  listProducts,
} from '@/services/catalog/listing.service'
import { createCategory, createProduct } from '../helpers/factories'

const params = (raw: Record<string, string | string[]> = {}, sort: SortOption = 'featured') =>
  parseListingParams(raw, { sort })

async function names(
  scope: ListingScope,
  raw: Record<string, string | string[]> = {},
  sort: SortOption = 'featured',
) {
  const page = await listProducts(scope, params(raw, sort), 'en')
  return page.items.map((item) => item.name)
}

describe('product listings', () => {
  it('shows only published, live products in active categories', async () => {
    const live = await createCategory()
    const hidden = await createCategory()
    await prisma.category.update({ where: { id: hidden.id }, data: { isActive: false } })
    await createProduct({ nameEn: 'Visible', categoryId: live.id })
    await createProduct({ nameEn: 'Draft', categoryId: live.id, status: 'DRAFT' })
    await createProduct({ nameEn: 'Archived', categoryId: live.id, status: 'ARCHIVED' })
    const scheduled = await createProduct({ nameEn: 'Scheduled', categoryId: live.id })
    await prisma.product.update({
      where: { id: scheduled.product.id },
      data: { publishedAt: new Date(Date.now() + 86_400_000) },
    })
    await createProduct({ nameEn: 'In hidden category', categoryId: hidden.id })

    expect(await names({ kind: 'all' })).toEqual(['Visible'])
  })

  it('includes products from subcategories and unisex pieces in gender collections', async () => {
    const accessories = await createCategory({ slug: 'accessories-t' })
    const wallets = await createCategory({ slug: 'wallets-t', parentId: accessories.id })
    await createProduct({ nameEn: 'Wallet', categoryId: wallets.id, gender: 'MEN' })
    await createProduct({ nameEn: 'Scarf', categoryId: accessories.id, gender: 'UNISEX' })
    await createProduct({ nameEn: 'Clutch', gender: 'WOMEN' })

    const subtree = { kind: 'category' as const, categoryIds: [accessories.id, wallets.id] }
    expect((await names(subtree)).sort()).toEqual(['Scarf', 'Wallet'])
    expect((await names({ kind: 'gender', gender: 'WOMEN' })).sort()).toEqual(['Clutch', 'Scarf'])
    expect((await names({ kind: 'gender', gender: 'MEN' })).sort()).toEqual(['Scarf', 'Wallet'])
  })

  it('filters by colour and availability on the same variant', async () => {
    await createProduct({
      nameEn: 'Black sold out, brown in stock',
      variants: [
        { stock: 0, colorFamily: 'BLACK' },
        { stock: 4, colorFamily: 'BROWN' },
      ],
    })
    await createProduct({
      nameEn: 'Black in stock',
      variants: [{ stock: 2, colorFamily: 'BLACK' }],
    })
    const reserved = await createProduct({
      nameEn: 'Fully reserved',
      variants: [{ stock: 2, colorFamily: 'BLACK' }],
    })
    await prisma.inventory.update({
      where: { variantId: reserved.variant.id },
      data: { reserved: 2 },
    })

    expect((await names({ kind: 'all' }, { color: 'black' })).sort()).toEqual([
      'Black in stock',
      'Black sold out, brown in stock',
      'Fully reserved',
    ])
    expect(await names({ kind: 'all' }, { color: 'black', instock: '1' })).toEqual([
      'Black in stock',
    ])
    expect((await names({ kind: 'all' }, { instock: '1' })).sort()).toEqual([
      'Black in stock',
      'Black sold out, brown in stock',
    ])
  })

  it('filters by price range in riyals', async () => {
    await createProduct({ nameEn: 'Cheap', price: 19_900 })
    await createProduct({ nameEn: 'Mid', price: 59_900 })
    await createProduct({ nameEn: 'Dear', price: 199_900 })
    expect(await names({ kind: 'all' }, { min: '200', max: '1000' })).toEqual(['Mid'])
    // Bounds are inclusive: "up to SAR 599" includes a SAR 599.00 product.
    expect((await names({ kind: 'all' }, { max: '598' })).sort()).toEqual(['Cheap'])
    expect((await names({ kind: 'all' }, { max: '599' })).sort()).toEqual(['Cheap', 'Mid'])
  })

  it('finds offers from product-level and variant-level compare-at prices', async () => {
    await createProduct({ nameEn: 'Product sale', price: 50_000, compareAtPrice: 70_000 })
    const variantSale = await createProduct({
      nameEn: 'Variant sale',
      variants: [{ stock: 3, price: 40_000 }],
    })
    await prisma.productVariant.update({
      where: { id: variantSale.variant.id },
      data: { compareAtPrice: 45_000 },
    })
    await createProduct({ nameEn: 'Fake sale', price: 50_000, compareAtPrice: 50_000 })
    await createProduct({ nameEn: 'Full price' })

    expect((await names({ kind: 'offers' })).sort()).toEqual(['Product sale', 'Variant sale'])
    expect((await names({ kind: 'all' }, { sale: '1' })).sort()).toEqual([
      'Product sale',
      'Variant sale',
    ])
    const card = (await listProducts({ kind: 'offers' }, params(), 'en')).items.find(
      (i) => i.name === 'Product sale',
    )
    expect(card).toMatchObject({ price: 50_000, compareAtPrice: 70_000, discountPercent: 28 })
  })

  it('searches Arabic and English text, ignoring spelling variants', async () => {
    const tote = await createProduct({ nameEn: 'Amara Tote' })
    await prisma.product.update({
      where: { id: tote.product.id },
      data: { searchText: 'حقيبه امارا توت amara tote vlr-bag-amara' },
    })
    await createProduct({ nameEn: 'Atlas Watch' })

    for (const q of ['حقيبة', 'الحقيبة', 'أمارا', 'AMARA', 'vlr-bag-amara', 'شنطة']) {
      expect(await names({ kind: 'all' }, { q }), q).toEqual(['Amara Tote'])
    }
    expect(await names({ kind: 'all' }, { q: 'nothing-like-this' })).toEqual([])
  })

  it('sorts deterministically and paginates without overlap', async () => {
    const category = await createCategory()
    for (let i = 0; i < PAGE_SIZE + 5; i++) {
      await createProduct({
        nameEn: `P${String(i).padStart(2, '0')}`,
        price: 10_000 + (i % 7) * 1_000,
        categoryId: category.id,
      })
    }
    const scope = { kind: 'category' as const, categoryIds: [category.id] }
    const first = await listProducts(scope, params({ sort: 'price-asc' }), 'en')
    const second = await listProducts(scope, params({ sort: 'price-asc', page: '2' }), 'en')
    expect(first.total).toBe(PAGE_SIZE + 5)
    expect(first.pageCount).toBe(2)
    expect(first.items).toHaveLength(PAGE_SIZE)
    expect(second.items).toHaveLength(5)
    const ids = [...first.items, ...second.items].map((i) => i.id)
    expect(new Set(ids).size).toBe(PAGE_SIZE + 5)
    const prices = [...first.items, ...second.items].map((i) => i.price)
    expect(prices).toEqual([...prices].sort((a, b) => a - b))

    const beyond = await listProducts(scope, params({ page: '9' }), 'en')
    expect(beyond).toMatchObject({ total: PAGE_SIZE + 5, items: [] })
  })

  it('computes facets from the unfiltered scope', async () => {
    await createProduct({
      nameEn: 'A',
      price: 30_000,
      gender: 'WOMEN',
      variants: [{ stock: 1, colorFamily: 'BLACK' }],
    })
    await createProduct({
      nameEn: 'B',
      price: 90_000,
      gender: 'MEN',
      variants: [{ stock: 1, colorFamily: 'GOLD' }],
    })
    const facets = await getListingFacets({ kind: 'all' }, '')
    expect(facets.colors).toEqual(['BLACK', 'GOLD'])
    expect(facets.genders).toEqual(['WOMEN', 'MEN'])
    expect(facets.priceRange).toEqual({ min: 30_000, max: 90_000 })
    expect((await getListingFacets({ kind: 'offers' }, '')).priceRange).toBeNull()
  })
})
