import type { NextRequest } from 'next/server'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DELETE as deleteBannerRoute,
  PUT as updateBannerRoute,
} from '@/app/api/admin/banners/[id]/route'
import { POST as createBannerRoute } from '@/app/api/admin/banners/route'
import { POST as uploadBannerRoute } from '@/app/api/admin/banners/upload/route'
import {
  DELETE as deleteCouponRoute,
  PUT as updateCouponRoute,
} from '@/app/api/admin/coupons/[id]/route'
import { POST as createCouponRoute } from '@/app/api/admin/coupons/route'
import { DELETE as deleteFaqRoute, PUT as updateFaqRoute } from '@/app/api/admin/faq/[id]/route'
import { POST as createFaqRoute } from '@/app/api/admin/faq/route'
import { PUT as updatePageRoute } from '@/app/api/admin/pages/[slug]/route'
import { POST as applyCouponRoute } from '@/app/api/cart/coupon/route'
import { prisma } from '@/db/client'
import { getActiveBanners } from '@/services/content/banner.service'
import { getPublishedFaq, getPublishedPage } from '@/services/content/page.service'
import { setStorage, type StorageProvider } from '@/services/storage/storage.service'
import type { CartView } from '@/types/cart'
import { toStoreDateTimeLocal } from '@/utils/time'
import { addToBag, placeOrder, signedInCustomer, signedInStaff } from '../helpers/checkout'
import { createProduct } from '../helpers/factories'
import type { TestClient } from '../helpers/http'

class MemoryStorage implements StorageProvider {
  readonly name = 'local' as const
  readonly files = new Map<string, Uint8Array>()
  async put(key: string, body: Uint8Array) {
    this.files.set(key, body)
    return { key, url: `/uploads/${key}` }
  }
  async delete(key: string) {
    this.files.delete(key)
  }
}

type Body = {
  data?: Record<string, unknown>
  error?: { code: string; fieldErrors?: Record<string, string>; details?: Record<string, unknown> }
}
type Route<P> = (req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response>

function call<P = Record<string, never>>(
  client: TestClient,
  route: Route<P>,
  options: { method?: string; body?: unknown; form?: FormData; params?: P },
) {
  return client.call<Body, P>(route, options)
}

let storage: MemoryStorage
beforeEach(() => {
  storage = new MemoryStorage()
  setStorage(storage)
})
afterEach(() => setStorage(null))

function couponBody(overrides: Record<string, unknown> = {}) {
  return {
    code: 'bags10',
    descriptionAr: null,
    descriptionEn: 'Ten percent off selected bags',
    type: 'PERCENTAGE',
    value: 1_000,
    minOrderAmount: null,
    maxDiscountAmount: null,
    startsAt: null,
    expiresAt: null,
    usageLimit: null,
    usageLimitPerUser: 1,
    scope: 'ALL',
    productSkus: [],
    categoryIds: [],
    isActive: true,
    ...overrides,
  }
}

function bannerBody(overrides: Record<string, unknown> = {}) {
  return {
    placement: 'HERO',
    titleAr: 'مجموعة الخريف',
    titleEn: 'The autumn edit',
    subtitleAr: null,
    subtitleEn: null,
    ctaLabelAr: 'تسوقي الآن',
    ctaLabelEn: 'Shop now',
    linkUrl: '/new-arrivals',
    imageUrl: '/images/editorial/hero-desktop.webp',
    imageKey: null,
    mobileImageUrl: '',
    altAr: null,
    altEn: 'Model holding a camel leather tote',
    startsAt: '',
    endsAt: '',
    isActive: true,
    sortOrder: 0,
    ...overrides,
  }
}

describe('admin coupons', () => {
  it('creates a product-scoped coupon that discounts only those products, and keeps used coupons', async () => {
    const admin = await signedInStaff('coupon-admin@example.test', 'ADMIN')
    const staff = await signedInStaff('coupon-staff@example.test')
    const bag = await createProduct({ price: 40_000, stock: 5 })
    const belt = await createProduct({ price: 20_000, stock: 5 })

    // Default staff cannot touch coupons.
    expect((await call(staff.client, createCouponRoute, { body: couponBody() })).status).toBe(403)

    const unknown = await call(admin.client, createCouponRoute, {
      body: couponBody({ scope: 'PRODUCTS', productSkus: [bag.product.sku, 'NOPE-123'] }),
    })
    expect(unknown.status).toBe(422)
    expect(unknown.body.error?.fieldErrors).toHaveProperty('productSkus')
    expect(unknown.body.error?.details).toMatchObject({ skus: ['NOPE-123'] })

    const tooMuch = await call(admin.client, createCouponRoute, {
      body: couponBody({ value: 10_001 }),
    })
    expect(tooMuch.status).toBe(422)
    expect(tooMuch.body.error?.fieldErrors).toHaveProperty('value')

    const backwards = await call(admin.client, createCouponRoute, {
      body: couponBody({ startsAt: '2026-05-02T10:00', expiresAt: '2026-05-01T10:00' }),
    })
    expect(backwards.status).toBe(422)
    expect(backwards.body.error?.fieldErrors).toHaveProperty('expiresAt')

    const created = await call(admin.client, createCouponRoute, {
      body: couponBody({ scope: 'PRODUCTS', productSkus: [bag.product.sku.toLowerCase()] }),
    })
    expect(created.status).toBe(201)
    const coupon = await prisma.coupon.findUniqueOrThrow({
      where: { code: 'BAGS10' },
      include: { products: true },
    })
    expect(coupon).toMatchObject({ type: 'PERCENTAGE', value: 1_000, scope: 'PRODUCTS' })
    expect(coupon.products.map((entry) => entry.productId)).toEqual([bag.product.id])
    expect(
      await prisma.auditLog.count({ where: { entityId: coupon.id, action: 'coupon.created' } }),
    ).toBe(1)

    const duplicate = await call(admin.client, createCouponRoute, { body: couponBody() })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.error?.fieldErrors).toHaveProperty('code')

    // The shopper's cart prices the coupon on the server: 10% of the bag only.
    const shopper = await signedInCustomer('coupon-shopper@example.test')
    await addToBag(shopper.client, bag.variant.id)
    await addToBag(shopper.client, belt.variant.id)
    const applied = await shopper.client.call<{ data: { cart: CartView } }>(applyCouponRoute, {
      body: { code: 'bags10' },
    })
    expect(applied.status).toBe(200)
    expect(applied.body.data.cart.totals.coupon).toMatchObject({ applied: true, discount: 4_000 })
    expect(applied.body.data.cart.totals.discountTotal).toBe(4_000)

    const order = await placeOrder(shopper.client, shopper.address.id)
    expect(order.status).toBe(200)

    const removeUsed = await call(admin.client, deleteCouponRoute, {
      method: 'DELETE',
      params: { id: coupon.id },
    })
    expect(removeUsed.status).toBe(409)
    expect(removeUsed.body.error?.details).toMatchObject({ reason: 'USED' })

    // Used coupons can still be switched off, but not capped below their use.
    const capped = await call(admin.client, updateCouponRoute, {
      method: 'PUT',
      params: { id: coupon.id },
      body: couponBody({ scope: 'PRODUCTS', productSkus: [bag.product.sku], usageLimit: 1 }),
    })
    expect(capped.status).toBe(200)
    const switchedOff = await call(admin.client, updateCouponRoute, {
      method: 'PUT',
      params: { id: coupon.id },
      body: couponBody({ scope: 'ALL', usageLimit: 1, isActive: false, code: 'BAGS10' }),
    })
    expect(switchedOff.status).toBe(200)
    expect(await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).toMatchObject({
      isActive: false,
      scope: 'ALL',
      usedCount: 1,
    })
    expect(await prisma.couponProduct.count({ where: { couponId: coupon.id } })).toBe(0)

    const unused = await call(admin.client, createCouponRoute, {
      body: couponBody({ code: 'SPARE5', type: 'FIXED_AMOUNT', value: 500 }),
    })
    const spareId = (unused.body.data?.coupon as { id: string }).id
    expect(
      (await call(admin.client, deleteCouponRoute, { method: 'DELETE', params: { id: spareId } }))
        .status,
    ).toBe(204)
  })

  it('rejects a usage limit below the times a coupon was already used', async () => {
    const admin = await signedInStaff('coupon-limit@example.test', 'ADMIN')
    const coupon = await prisma.coupon.create({
      data: { code: 'BUSY', type: 'FIXED_AMOUNT', value: 1_000, usedCount: 3 },
    })
    const res = await call(admin.client, updateCouponRoute, {
      method: 'PUT',
      params: { id: coupon.id },
      body: couponBody({ code: 'BUSY', type: 'FIXED_AMOUNT', value: 1_000, usageLimit: 2 }),
    })
    expect(res.status).toBe(422)
    expect(res.body.error?.fieldErrors).toHaveProperty('usageLimit')
  })

  it('reads coupon windows in store time (Riyadh, UTC+3)', async () => {
    const admin = await signedInStaff('coupon-window@example.test', 'ADMIN')
    const res = await call(admin.client, createCouponRoute, {
      body: couponBody({
        code: 'NATIONALDAY',
        startsAt: '2026-09-23T00:00',
        expiresAt: '2026-09-25T23:59',
      }),
    })
    expect(res.status).toBe(201)
    expect(await prisma.coupon.findUniqueOrThrow({ where: { code: 'NATIONALDAY' } })).toMatchObject(
      {
        startsAt: new Date('2026-09-22T21:00:00.000Z'),
        expiresAt: new Date('2026-09-25T20:59:00.000Z'),
      },
    )
  })
})

describe('admin banners', () => {
  it('accepts only the store’s own images and safe links, and follows the schedule', async () => {
    const admin = await signedInStaff('banner-admin@example.test', 'ADMIN')
    const foreign = await call(admin.client, createBannerRoute, {
      body: bannerBody({ imageUrl: 'https://images.example.com/hero.jpg' }),
    })
    expect(foreign.status).toBe(422)
    expect(foreign.body.error?.fieldErrors).toHaveProperty('imageUrl')

    const script = await call(admin.client, createBannerRoute, {
      body: bannerBody({ linkUrl: 'javascript:alert(1)' }),
    })
    expect(script.status).toBe(422)
    expect(script.body.error?.fieldErrors).toHaveProperty('linkUrl')

    const startsAt = toStoreDateTimeLocal(new Date(Date.now() + 2 * 86_400_000))
    const created = await call(admin.client, createBannerRoute, {
      body: bannerBody({ startsAt }),
    })
    expect(created.status).toBe(201)
    const bannerId = (created.body.data?.banner as { id: string }).id
    expect(await getActiveBanners('HERO', 'en')).toEqual([])

    const live = await call(admin.client, updateBannerRoute, {
      method: 'PUT',
      params: { id: bannerId },
      body: bannerBody({ startsAt: '' }),
    })
    expect(live.status).toBe(200)
    expect(await getActiveBanners('HERO', 'ar')).toEqual([
      expect.objectContaining({ title: 'مجموعة الخريف', href: '/ar/new-arrivals' }),
    ])
    expect(
      await prisma.auditLog.count({ where: { entityId: bannerId, action: 'banner.updated' } }),
    ).toBe(1)
  })

  it('re-encodes uploaded banner images and removes the file with its last banner', async () => {
    const admin = await signedInStaff('banner-upload@example.test', 'ADMIN')
    const staff = await signedInStaff('banner-staff@example.test')
    const bytes = await sharp({
      create: { width: 1600, height: 700, channels: 3, background: '#a0672a' },
    })
      .png()
      .toBuffer()
    const form = () => {
      const data = new FormData()
      data.set('file', new File([new Uint8Array(bytes)], 'hero.png', { type: 'image/png' }))
      return data
    }
    expect((await call(staff.client, uploadBannerRoute, { form: form() })).status).toBe(403)

    const fake = new FormData()
    fake.set('file', new File(['<svg onload="alert(1)"/>'], 'x.png', { type: 'image/png' }))
    const rejected = await call(admin.client, uploadBannerRoute, { form: fake })
    expect(rejected.status).toBe(415)
    expect(rejected.body.error?.details).toMatchObject({ reason: 'UNSUPPORTED_TYPE' })

    const uploaded = await call(admin.client, uploadBannerRoute, { form: form() })
    expect(uploaded.status).toBe(201)
    const image = uploaded.body.data?.image as { url: string; key: string }
    expect(image.key).toMatch(/^banners\/[0-9a-f]{32}\.webp$/)
    expect(image.url).toBe(`/uploads/${image.key}`)
    expect((await sharp(storage.files.get(image.key)!).metadata()).format).toBe('webp')

    const created = await call(admin.client, createBannerRoute, {
      body: bannerBody({ imageUrl: image.url, imageKey: image.key }),
    })
    expect(created.status).toBe(201)
    const bannerId = (created.body.data?.banner as { id: string }).id
    expect(
      (await call(admin.client, deleteBannerRoute, { method: 'DELETE', params: { id: bannerId } }))
        .status,
    ).toBe(204)
    expect(storage.files.has(image.key)).toBe(false)
  })
})

describe('admin pages and FAQ', () => {
  async function shippingPage() {
    await prisma.setting.create({ data: { key: 'shipping', value: { standardFee: 2_500 } } })
    return prisma.page.create({
      data: {
        slug: 'shipping',
        titleAr: 'الشحن والتوصيل',
        titleEn: 'Shipping',
        contentAr: 'نص قديم',
        contentEn: 'Old text',
      },
    })
  }

  const pageBody = (overrides: Record<string, unknown> = {}) => ({
    titleAr: 'الشحن والتوصيل',
    titleEn: 'Shipping & delivery',
    contentAr: '## الرسوم\n\nالشحن العادي {{standardFee}}.',
    contentEn: '## Fees\n\nStandard shipping is {{standardFee}}.',
    seoTitleAr: '',
    seoTitleEn: 'Shipping fees and delivery times',
    seoDescriptionAr: '',
    seoDescriptionEn: '',
    isPublished: true,
    ...overrides,
  })

  it('updates the live page (tokens rendered on read), hides unpublished pages and audits edits', async () => {
    const page = await shippingPage()
    const admin = await signedInStaff('pages-admin@example.test', 'ADMIN')
    const staff = await signedInStaff('pages-staff@example.test')
    expect(
      (
        await call(staff.client, updatePageRoute, {
          method: 'PUT',
          params: { slug: 'shipping' },
          body: pageBody(),
        })
      ).status,
    ).toBe(403)

    const saved = await call(admin.client, updatePageRoute, {
      method: 'PUT',
      params: { slug: 'shipping' },
      body: pageBody(),
    })
    expect(saved.status).toBe(200)
    // The stored text keeps the token, so a fee change later updates the page too.
    expect(await prisma.page.findUniqueOrThrow({ where: { id: page.id } })).toMatchObject({
      contentEn: '## Fees\n\nStandard shipping is {{standardFee}}.',
      seoTitleAr: null,
      seoTitleEn: 'Shipping fees and delivery times',
      updatedById: admin.user.id,
    })
    expect(await getPublishedPage('shipping', 'en')).toMatchObject({
      title: 'Shipping & delivery',
      content: '## Fees\n\nStandard shipping is SAR 25.',
    })
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: page.id, action: 'page.updated' },
    })
    expect(audit.metadata).toMatchObject({ slug: 'shipping', contentChanged: true })

    const hidden = await call(admin.client, updatePageRoute, {
      method: 'PUT',
      params: { slug: 'shipping' },
      body: pageBody({ isPublished: false }),
    })
    expect(hidden.status).toBe(200)
    expect(await getPublishedPage('shipping', 'en')).toBeNull()

    for (const slug of ['careers', 'Shipping', '../admin']) {
      const missing = await call(admin.client, updatePageRoute, {
        method: 'PUT',
        params: { slug },
        body: pageBody(),
      })
      expect(missing.status).toBe(404)
    }
    const empty = await call(admin.client, updatePageRoute, {
      method: 'PUT',
      params: { slug: 'shipping' },
      body: pageBody({ contentEn: '   ' }),
    })
    expect(empty.status).toBe(422)
    expect(empty.body.error?.fieldErrors).toHaveProperty('contentEn')
  })

  it('creates, edits, hides and deletes FAQ entries', async () => {
    await prisma.setting.create({ data: { key: 'returns', value: { windowDays: 14 } } })
    const admin = await signedInStaff('faq-admin@example.test', 'ADMIN')
    const body = {
      questionAr: 'كم مدة الإرجاع؟',
      questionEn: 'How long do I have to return an item?',
      answerAr: 'خلال {{returnWindowDays}} يوماً من الاستلام.',
      answerEn: 'Within {{returnWindowDays}} days of delivery.',
      sortOrder: 2,
      isPublished: true,
    }
    const created = await call(admin.client, createFaqRoute, { body })
    expect(created.status).toBe(201)
    const faqId = (created.body.data?.faq as { id: string }).id
    expect(await getPublishedFaq('en')).toEqual([
      {
        id: faqId,
        question: 'How long do I have to return an item?',
        answer: 'Within 14 days of delivery.',
      },
    ])

    const tooShort = await call(admin.client, updateFaqRoute, {
      method: 'PUT',
      params: { id: faqId },
      body: { ...body, questionEn: 'Q' },
    })
    expect(tooShort.status).toBe(422)
    expect(tooShort.body.error?.fieldErrors).toHaveProperty('questionEn')

    const hidden = await call(admin.client, updateFaqRoute, {
      method: 'PUT',
      params: { id: faqId },
      body: { ...body, isPublished: false },
    })
    expect(hidden.status).toBe(200)
    expect(await getPublishedFaq('en')).toEqual([])

    expect(
      (await call(admin.client, deleteFaqRoute, { method: 'DELETE', params: { id: faqId } }))
        .status,
    ).toBe(204)
    expect(await prisma.faqItem.count()).toBe(0)
    const actions = await prisma.auditLog.findMany({
      where: { entityId: faqId },
      select: { action: true },
    })
    expect(actions.map((row) => row.action).sort()).toEqual([
      'faq.created',
      'faq.deleted',
      'faq.updated',
    ])
  })
})
