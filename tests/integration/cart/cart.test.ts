import { describe, expect, it } from 'vitest'
import { POST as login } from '@/app/api/auth/login/route'
import { POST as applyCoupon, DELETE as removeCoupon } from '@/app/api/cart/coupon/route'
import { DELETE as removeItem, PATCH as updateItem } from '@/app/api/cart/items/[id]/route'
import { POST as moveToWishlist } from '@/app/api/cart/items/[id]/move-to-wishlist/route'
import { POST as addItem } from '@/app/api/cart/items/route'
import { GET as getCart } from '@/app/api/cart/route'
import { POST as moveToCart } from '@/app/api/wishlist/items/[productId]/move-to-cart/route'
import { POST as addWishlist } from '@/app/api/wishlist/items/route'
import { prisma } from '@/db/client'
import { hashPassword } from '@/lib/auth/password'
import type { CartView } from '@/types/cart'
import { createCategory, createProduct, createUser } from '../helpers/factories'
import { type ApiError, TestClient } from '../helpers/http'

type CartResponse = { data: { cart: CartView } }
const PASSWORD = 'Desert-Rose-2026'

async function signedIn(email: string) {
  const user = await createUser({ email, passwordHash: await hashPassword(PASSWORD) })
  const client = new TestClient()
  expect((await client.call(login, { body: { email, password: PASSWORD } })).status).toBe(200)
  return { user, client }
}

async function createCoupon(
  data: Partial<Parameters<typeof prisma.coupon.create>[0]['data']> & { code: string },
) {
  return prisma.coupon.create({ data: { type: 'PERCENTAGE', value: 1_000, ...data } })
}

describe('bag', () => {
  it('creates a guest bag with a cookie and increments quantities', async () => {
    const { variant } = await createProduct({ price: 50_000, stock: 5 })
    const guest = new TestClient()
    const first = await guest.call<CartResponse>(addItem, {
      body: { variantId: variant.id, quantity: 1 },
    })
    expect(first.status).toBe(200)
    expect([...guest.cookies.keys()].some((name) => name.includes('velora_guest'))).toBe(true)
    const second = await guest.call<CartResponse>(addItem, {
      body: { variantId: variant.id, quantity: 2 },
    })
    expect(second.body.data.cart.lines).toHaveLength(1)
    expect(second.body.data.cart.lines[0]).toMatchObject({
      quantity: 3,
      unitPrice: 50_000,
      lineTotal: 150_000,
    })
    expect(await prisma.cart.count()).toBe(1)
  })

  it('computes totals on the server and ignores client-supplied prices', async () => {
    const { variant } = await createProduct({ price: 12_000, stock: 5 })
    const guest = new TestClient()
    const res = await guest.call<CartResponse>(addItem, {
      body: { variantId: variant.id, quantity: 2, price: 1, total: 1, discount: 99_999 },
    })
    expect(res.body.data.cart.totals).toMatchObject({
      subtotal: 24_000,
      shippingTotal: 2_500,
      total: 26_500,
      discountTotal: 0,
    })
  })

  it('enforces stock and the per-item limit', async () => {
    const { variant } = await createProduct({ stock: 2 })
    const guest = new TestClient()
    const tooMany = await guest.call<ApiError>(addItem, {
      body: { variantId: variant.id, quantity: 3 },
    })
    expect(tooMany.status).toBe(409)
    expect(tooMany.body.error.code).toBe('INSUFFICIENT_STOCK')
    // The failed add was rolled back: nothing is in the bag.
    const view = await guest.call<CartResponse>(getCart)
    expect(view.body.data.cart.lines).toHaveLength(0)

    const { variant: plenty } = await createProduct({ stock: 500 })
    const overLimit = await guest.call<ApiError>(addItem, {
      body: { variantId: plenty.id, quantity: 11 },
    })
    expect(overLimit.status).toBe(422)
    expect(overLimit.body.error.code).toBe('QUANTITY_LIMIT_EXCEEDED')
  })

  it('rejects unpublished products and unknown variants', async () => {
    const { variant } = await createProduct({ status: 'DRAFT' })
    const guest = new TestClient()
    expect(
      (await guest.call<ApiError>(addItem, { body: { variantId: variant.id } })).body.error.code,
    ).toBe('PRODUCT_UNAVAILABLE')
    expect(
      (
        await guest.call<ApiError>(addItem, {
          body: { variantId: '01900000-0000-7000-8000-000000000000' },
        })
      ).body.error.code,
    ).toBe('VARIANT_NOT_FOUND')
  })

  it('flags lines whose stock dropped and blocks checkout until fixed', async () => {
    const { variant } = await createProduct({ stock: 5 })
    const guest = new TestClient()
    await guest.call(addItem, { body: { variantId: variant.id, quantity: 4 } })
    await prisma.inventory.update({ where: { variantId: variant.id }, data: { reserved: 3 } })
    const view = (await guest.call<CartResponse>(getCart)).body.data.cart
    expect(view.lines[0]).toMatchObject({ issue: 'insufficient_stock', maxQuantity: 2 })
    expect(view.hasIssues).toBe(true)
  })

  it('updates, removes and protects items from other shoppers', async () => {
    const { variant } = await createProduct({ stock: 9 })
    const owner = new TestClient()
    const added = await owner.call<CartResponse>(addItem, {
      body: { variantId: variant.id, quantity: 1 },
    })
    const itemId = added.body.data.cart.lines[0]!.id

    const stranger = new TestClient()
    await stranger.call(addItem, { body: { variantId: variant.id, quantity: 1 } })
    expect(
      (
        await stranger.call<ApiError, { id: string }>(updateItem, {
          body: { quantity: 5 },
          params: { id: itemId },
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await stranger.call<ApiError, { id: string }>(removeItem, {
          method: 'DELETE',
          params: { id: itemId },
        })
      ).status,
    ).toBe(404)

    const updated = await owner.call<CartResponse, { id: string }>(updateItem, {
      body: { quantity: 3 },
      params: { id: itemId },
    })
    expect(updated.body.data.cart.lines[0]?.quantity).toBe(3)
    const removed = await owner.call<CartResponse, { id: string }>(updateItem, {
      body: { quantity: 0 },
      params: { id: itemId },
    })
    expect(removed.body.data.cart.lines).toHaveLength(0)
  })

  it('moves items between bag and wishlist', async () => {
    const { product, variant } = await createProduct({ stock: 3 })
    const guest = new TestClient()
    const added = await guest.call<CartResponse>(addItem, { body: { variantId: variant.id } })
    const moved = await guest.call<CartResponse, { id: string }>(moveToWishlist, {
      body: {},
      params: { id: added.body.data.cart.lines[0]!.id },
    })
    expect(moved.body.data.cart.lines).toHaveLength(0)
    expect(
      await prisma.wishlistItem.count({ where: { productId: product.id, variantId: variant.id } }),
    ).toBe(1)

    const back = await guest.call<CartResponse, { productId: string }>(moveToCart, {
      body: {},
      params: { productId: product.id },
    })
    expect(back.body.data.cart.lines).toHaveLength(1)
    expect(await prisma.wishlistItem.count()).toBe(0)
  })

  it('adds to the wishlist idempotently for guests', async () => {
    const { product } = await createProduct()
    const guest = new TestClient()
    expect((await guest.call(addWishlist, { body: { productId: product.id } })).status).toBe(200)
    expect((await guest.call(addWishlist, { body: { productId: product.id } })).status).toBe(200)
    expect(await prisma.wishlistItem.count()).toBe(1)
  })
})

describe('coupons', () => {
  it('applies a valid code and recalculates on the server', async () => {
    await createCoupon({ code: 'VELORA10', maxDiscountAmount: 30_000, minOrderAmount: 20_000 })
    const { variant } = await createProduct({ price: 50_000, stock: 5 })
    const guest = new TestClient()
    await guest.call(addItem, { body: { variantId: variant.id } })
    const applied = await guest.call<CartResponse>(applyCoupon, { body: { code: 'velora10' } })
    expect(applied.status).toBe(200)
    expect(applied.body.data.cart.totals).toMatchObject({
      discountTotal: 5_000,
      coupon: { code: 'VELORA10', applied: true },
    })

    const cleared = await guest.call<CartResponse>(removeCoupon, { method: 'DELETE' })
    expect(cleared.body.data.cart.totals.discountTotal).toBe(0)
  })

  it('explains why a code does not apply', async () => {
    const now = Date.now()
    await createCoupon({ code: 'MIN500', minOrderAmount: 50_000 })
    await createCoupon({
      code: 'EXPIRED1',
      expiresAt: new Date(now - 1_000),
      startsAt: new Date(now - 100_000),
    })
    await createCoupon({ code: 'OFF', isActive: false })
    await createCoupon({ code: 'ONCE', usageLimitPerUser: 1 })
    await createCoupon({ code: 'USEDUP', usageLimit: 1, usedCount: 1 })
    const bags = await createCategory()
    await createCoupon({
      code: 'BAGSONLY',
      scope: 'CATEGORIES',
      categories: { create: [{ categoryId: bags.id }] },
    })
    const { variant } = await createProduct({ price: 10_000, stock: 5 })
    const guest = new TestClient()
    await guest.call(addItem, { body: { variantId: variant.id } })

    const reasons: Record<string, string> = {}
    for (const code of ['MIN500', 'EXPIRED1', 'OFF', 'ONCE', 'USEDUP', 'BAGSONLY', 'NOPE']) {
      const res = await guest.call<ApiError>(applyCoupon, { body: { code } })
      expect(res.status, code).toBe(422)
      reasons[code] = String(res.body.error.details?.reason)
    }
    expect(reasons).toEqual({
      MIN500: 'MIN_ORDER_NOT_MET',
      EXPIRED1: 'EXPIRED',
      OFF: 'INACTIVE',
      ONCE: 'LOGIN_REQUIRED',
      USEDUP: 'USAGE_LIMIT_REACHED',
      BAGSONLY: 'NOT_APPLICABLE',
      NOPE: 'NOT_FOUND',
    })
    expect((await prisma.cart.findFirstOrThrow()).couponCode).toBeNull()
  })

  it('enforces per-customer limits for signed-in customers', async () => {
    const coupon = await createCoupon({
      code: 'WELCOME50',
      type: 'FIXED_AMOUNT',
      value: 5_000,
      usageLimitPerUser: 1,
    })
    const { variant } = await createProduct({ price: 40_000, stock: 5 })
    const { user, client } = await signedIn('repeat@example.test')
    await client.call(addItem, { body: { variantId: variant.id } })
    expect((await client.call(applyCoupon, { body: { code: 'WELCOME50' } })).status).toBe(200)

    // Simulate an earlier order that used it.
    const order = await prisma.order.create({
      data: {
        orderNumber: 'VLR-TEST-000001',
        userId: user.id,
        paymentMethod: 'CARD',
        shippingMethod: 'STANDARD',
        subtotal: 40_000,
        total: 40_000,
        pricesIncludeTax: true,
        taxRateBps: 1_500,
        shippingName: 'x',
        shippingPhone: '+966500000000',
        shippingEmail: 'repeat@example.test',
        shippingCity: 'Riyadh',
        shippingDistrict: 'Olaya',
        shippingStreet: 'King Fahd',
        shippingBuilding: '1234',
        shippingPostalCode: '12345',
      },
    })
    await prisma.couponUsage.create({
      data: { couponId: coupon.id, userId: user.id, orderId: order.id, discountAmount: 5_000 },
    })
    const view = (await client.call<CartResponse>(getCart)).body.data.cart
    expect(view.couponIssue).toMatchObject({ code: 'WELCOME50', reason: 'USER_LIMIT_REACHED' })
    expect(view.totals.discountTotal).toBe(0)
  })

  it('rate-limits guessing', async () => {
    const { variant } = await createProduct({ stock: 5 })
    const guest = new TestClient()
    await guest.call(addItem, { body: { variantId: variant.id } })
    let last = 0
    for (let i = 0; i < 21; i++)
      last = (await guest.call(applyCoupon, { body: { code: `GUESS${i}X` } })).status
    expect(last).toBe(429)
  })
})
