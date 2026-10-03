import { describe, expect, it } from 'vitest'
import { prisma } from '@/db/client'
import { getApprovedReviews, getProductPage } from '@/services/catalog/product.service'
import { getActiveBanners } from '@/services/content/banner.service'
import { getPublishedFaq, getPublishedPage } from '@/services/content/page.service'
import { createCategory, createProduct, createUser } from '../helpers/factories'

describe('product page lookup', () => {
  it('serves the canonical slug and redirects the other language’s slug', async () => {
    const { product } = await createProduct({ nameEn: 'Luna Bag' })
    await prisma.product.update({
      where: { id: product.id },
      data: { slugAr: 'حقيبة-لونا', slugEn: 'luna-bag' },
    })

    expect(await getProductPage('luna-bag', 'en')).toMatchObject({
      status: 'ok',
      product: { name: 'Luna Bag' },
    })
    expect(await getProductPage(encodeURIComponent('حقيبة-لونا'), 'ar')).toMatchObject({
      status: 'ok',
    })
    expect(await getProductPage('حقيبة-لونا', 'en')).toEqual({
      status: 'redirect',
      slug: 'luna-bag',
    })
    expect(await getProductPage('luna-bag', 'ar')).toEqual({
      status: 'redirect',
      slug: 'حقيبة-لونا',
    })
    expect(await getProductPage('missing', 'en')).toEqual({ status: 'not_found' })
    expect(await getProductPage('%E0%A4%A', 'en')).toEqual({ status: 'not_found' })
  })

  it('hides unpublished products', async () => {
    const { product } = await createProduct({ status: 'DRAFT' })
    expect(await getProductPage(product.slugEn, 'en')).toEqual({ status: 'not_found' })
  })

  it('reports stock per variant without revealing exact counts unless low', async () => {
    const { product } = await createProduct({
      variants: [
        { stock: 50, colorFamily: 'BLACK' },
        { stock: 2, colorFamily: 'BROWN' },
        { stock: 0, colorFamily: 'BEIGE' },
      ],
    })
    const lookup = await getProductPage(product.slugEn, 'en')
    if (lookup.status !== 'ok') throw new Error('expected product')
    expect(lookup.product.variants.map((v) => [v.stock, v.lowStockCount])).toEqual([
      ['in_stock', null],
      ['low_stock', 2],
      ['out_of_stock', null],
    ])
    expect(lookup.product.defaultVariantId).toBe(lookup.product.variants[0]!.id)
  })

  it('builds breadcrumbs from the category tree', async () => {
    const parent = await createCategory({ slug: 'accessories-x' })
    const child = await createCategory({ slug: 'belts-x', parentId: parent.id })
    const { product } = await createProduct({ categoryId: child.id })
    const lookup = await getProductPage(product.slugEn, 'en')
    expect(lookup.status === 'ok' && lookup.product.breadcrumbs.map((b) => b.slug)).toEqual([
      'accessories-x',
      'belts-x',
    ])
  })
})

describe('reviews', () => {
  it('lists approved reviews only, with first names and a rating distribution', async () => {
    const { product } = await createProduct()
    const layla = await createUser({ name: 'Layla Al-Harbi' })
    const omar = await createUser({ name: 'Omar' })
    const sara = await createUser({ name: 'Sara' })
    await prisma.review.createMany({
      data: [
        {
          productId: product.id,
          userId: layla.id,
          rating: 5,
          body: 'Beautiful leather.',
          status: 'APPROVED',
          isVerifiedPurchase: true,
        },
        { productId: product.id, userId: omar.id, rating: 3, body: 'Good.', status: 'APPROVED' },
        { productId: product.id, userId: sara.id, rating: 1, body: 'Spam spam', status: 'PENDING' },
      ],
    })
    const reviews = await getApprovedReviews(product.id)
    expect(reviews.total).toBe(2)
    expect(reviews.items.map((r) => r.author).sort()).toEqual(['Layla', 'Omar'])
    expect(reviews.distribution).toEqual({ 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 })
    expect(JSON.stringify(reviews)).not.toContain('@')
  })
})

describe('banners', () => {
  it('returns only active banners inside their schedule window', async () => {
    const now = new Date()
    const base = {
      placement: 'PROMO' as const,
      titleAr: 'عرض',
      titleEn: 'Offer',
      imageUrl: '/images/x.webp',
    }
    await prisma.banner.createMany({
      data: [
        { ...base, titleEn: 'Live' },
        { ...base, titleEn: 'Inactive', isActive: false },
        { ...base, titleEn: 'Future', startsAt: new Date(now.getTime() + 3_600_000) },
        { ...base, titleEn: 'Expired', endsAt: new Date(now.getTime() - 1) },
        { ...base, titleEn: 'Unsafe link', linkUrl: 'javascript:alert(1)' },
      ],
    })
    const banners = await getActiveBanners('PROMO', 'en', now)
    expect(banners.map((b) => b.title).sort()).toEqual(['Live', 'Unsafe link'])
    expect(banners.find((b) => b.title === 'Unsafe link')?.href).toBeNull()
  })
})

describe('CMS pages', () => {
  it('renders settings tokens into published pages and FAQ answers', async () => {
    await prisma.setting.create({
      data: { key: 'shipping', value: { standardFee: 3_000, freeShippingThreshold: 50_000 } },
    })
    await prisma.page.create({
      data: {
        slug: 'shipping',
        titleAr: 'الشحن',
        titleEn: 'Shipping',
        contentAr: 'الرسوم {{standardFee}}',
        contentEn: 'Fee {{standardFee}}, free over {{freeShippingThreshold}}. {{unknown}}',
      },
    })
    await prisma.page.create({
      data: {
        slug: 'hidden',
        titleAr: 'x',
        titleEn: 'x',
        contentAr: 'x',
        contentEn: 'x',
        isPublished: false,
      },
    })
    await prisma.faqItem.create({
      data: {
        questionAr: 'س',
        questionEn: 'Q',
        answerAr: 'ج',
        answerEn: 'Free over {{freeShippingThreshold}}',
      },
    })

    expect((await getPublishedPage('shipping', 'en'))?.content).toBe(
      'Fee SAR 30, free over SAR 500. {{unknown}}',
    )
    expect(await getPublishedPage('hidden', 'en')).toBeNull()
    expect((await getPublishedFaq('en'))[0]?.answer).toBe('Free over SAR 500')
  })
})
