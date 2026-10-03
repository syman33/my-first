import type { NextRequest } from 'next/server'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POST as createBrandRoute } from '@/app/api/admin/brands/route'
import { POST as createCategoryRoute } from '@/app/api/admin/categories/route'
import { DELETE as deleteCategoryRoute } from '@/app/api/admin/categories/[id]/route'
import { POST as uploadRoute } from '@/app/api/admin/products/[id]/images/route'
import {
  DELETE as deleteProductRoute,
  PUT as updateProductRoute,
} from '@/app/api/admin/products/[id]/route'
import { POST as addVariantRoute } from '@/app/api/admin/products/[id]/variants/route'
import { POST as createProductRoute } from '@/app/api/admin/products/route'
import { PUT as updateVariantRoute } from '@/app/api/admin/variants/[id]/route'
import { POST as stockRoute } from '@/app/api/admin/variants/[id]/stock/route'
import { prisma } from '@/db/client'
import { getAdminProduct, listAdminProducts } from '@/services/admin/products.service'
import { setStorage, type StorageProvider } from '@/services/storage/storage.service'
import { createCategory } from '../helpers/factories'
import type { TestClient } from '../helpers/http'
import { confirmedOrder, signedInStaff } from '../helpers/checkout'

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

function productBody(categoryId: string, overrides: Record<string, unknown> = {}) {
  return {
    nameAr: 'حقيبة يد جلدية',
    nameEn: 'Leather Handbag',
    slugAr: 'حقيبة-يد-جلدية',
    slugEn: 'leather-handbag',
    sku: 'VLR-HB-100',
    descriptionAr: 'جلد طبيعي',
    descriptionEn: 'Genuine leather',
    price: 120_000,
    compareAtPrice: 150_000,
    cost: 45_000,
    categoryId,
    brandId: null,
    gender: 'WOMEN',
    materialAr: 'جلد',
    materialEn: 'Leather',
    careAr: null,
    careEn: null,
    lengthMm: 300,
    widthMm: null,
    heightMm: null,
    weightGrams: 800,
    isFeatured: false,
    isBestseller: false,
    isNewArrival: true,
    status: 'DRAFT',
    lowStockThreshold: 2,
    seoTitleAr: null,
    seoTitleEn: null,
    seoDescriptionAr: null,
    seoDescriptionEn: null,
    ...overrides,
  }
}

function variantBody(overrides: Record<string, unknown> = {}) {
  return {
    sku: 'VLR-HB-100-BLK',
    barcode: null,
    nameAr: 'أسود',
    nameEn: 'Black',
    colorFamily: 'BLACK',
    colorNameAr: 'أسود',
    colorNameEn: 'Black',
    colorHex: '#171717',
    size: null,
    price: null,
    compareAtPrice: null,
    imageId: null,
    isActive: true,
    isDefault: true,
    sortOrder: 0,
    lowStockThreshold: null,
    ...overrides,
  }
}

async function photo() {
  const bytes = await sharp({
    create: { width: 900, height: 1100, channels: 3, background: '#b89b72' },
  })
    .jpeg()
    .toBuffer()
  const form = new FormData()
  form.set('file', new File([new Uint8Array(bytes)], 'IMG_0001.jpg', { type: 'image/jpeg' }))
  form.set('altEn', 'Leather handbag, front')
  return form
}

describe('admin catalogue', () => {
  it('creates a draft with its first variant and opening stock, then publishes once it has a photo', async () => {
    const admin = await signedInStaff('cat-admin@example.test', 'ADMIN')
    const category = await createCategory({ slug: 'handbags' })

    const early = await call(admin.client, createProductRoute, {
      body: {
        product: productBody(category.id, { status: 'PUBLISHED' }),
        firstVariant: { variant: variantBody(), initialStock: 4 },
      },
    })
    expect(early.status).toBe(422)
    expect(early.body.error?.fieldErrors).toHaveProperty('status')

    const created = await call(admin.client, createProductRoute, {
      body: {
        product: productBody(category.id),
        firstVariant: { variant: variantBody(), initialStock: 4 },
      },
    })
    expect(created.status).toBe(201)
    const productId = (created.body.data!.product as { id: string }).id
    let detail = await getAdminProduct(productId)
    expect(detail).toMatchObject({ status: 'DRAFT', price: 120_000, hasOrders: false })
    expect(detail.variants).toMatchObject([{ sku: 'VLR-HB-100-BLK', isDefault: true, onHand: 4 }])
    expect(
      await prisma.inventoryTransaction.count({ where: { type: 'INITIAL', quantityDelta: 4 } }),
    ).toBe(1)
    const stored = await prisma.product.findUniqueOrThrow({ where: { id: productId } })
    expect(stored).toMatchObject({ minPrice: 120_000, maxPrice: 120_000 })
    expect(stored.searchText).toContain('leather')

    const noPhoto = await call(admin.client, updateProductRoute, {
      method: 'PUT',
      body: productBody(category.id, { status: 'PUBLISHED' }),
      params: { id: productId },
    })
    expect(noPhoto.status).toBe(422)
    expect(noPhoto.body.error?.fieldErrors).toHaveProperty('status')

    const upload = await call(admin.client, uploadRoute, {
      form: await photo(),
      params: { id: productId },
    })
    expect(upload.status).toBe(201)
    expect(storage.files.size).toBe(1)
    const [key] = [...storage.files.keys()]
    expect(key).toMatch(new RegExp(`^products/${productId}/[0-9a-f]{32}\\.webp$`))

    const published = await call(admin.client, updateProductRoute, {
      method: 'PUT',
      body: productBody(category.id, { status: 'PUBLISHED' }),
      params: { id: productId },
    })
    expect(published.status).toBe(200)
    detail = await getAdminProduct(productId)
    expect(detail.status).toBe('PUBLISHED')
    expect(detail.publishedAt).not.toBeNull()
    expect(detail.images[0]).toMatchObject({
      altEn: 'Leather handbag, front',
      width: 900,
      height: 1100,
    })
    expect(
      await prisma.auditLog.count({ where: { entityId: productId, action: 'product.published' } }),
    ).toBe(1)
  })

  it('reports duplicate slugs and SKUs on the right field', async () => {
    const admin = await signedInStaff('cat-dupe@example.test', 'ADMIN')
    const category = await createCategory({ slug: 'belts' })
    const body = {
      product: productBody(category.id),
      firstVariant: { variant: variantBody(), initialStock: 0 },
    }
    expect((await call(admin.client, createProductRoute, { body })).status).toBe(201)
    const dupeSlug = await call(admin.client, createProductRoute, {
      // Only the Arabic slug collides, so the error must point at that field.
      body: {
        product: productBody(category.id, { sku: 'VLR-HB-200', slugEn: 'leather-handbag-2' }),
        firstVariant: { variant: variantBody({ sku: 'VLR-HB-200-BLK' }), initialStock: 0 },
      },
    })
    expect(dupeSlug.status).toBe(409)
    expect(dupeSlug.body.error?.fieldErrors).toHaveProperty('slugAr')
    const dupeVariant = await call(admin.client, createProductRoute, {
      body: {
        product: productBody(category.id, { sku: 'VLR-HB-300', slugAr: 'اخرى', slugEn: 'other' }),
        firstVariant: { variant: variantBody(), initialStock: 0 },
      },
    })
    expect(dupeVariant.status).toBe(409)
    expect(dupeVariant.body.error?.code).toBe('SKU_TAKEN')
    expect(await prisma.product.count()).toBe(1)
  })

  it('manages variants: price range, default switch and the last active variant rule', async () => {
    const admin = await signedInStaff('cat-variants@example.test', 'ADMIN')
    const category = await createCategory({ slug: 'wallets' })
    const created = await call(admin.client, createProductRoute, {
      body: {
        product: productBody(category.id),
        firstVariant: { variant: variantBody(), initialStock: 2 },
      },
    })
    const productId = (created.body.data!.product as { id: string }).id
    const added = await call(admin.client, addVariantRoute, {
      body: {
        variant: variantBody({
          sku: 'VLR-HB-100-TAN',
          nameEn: 'Tan',
          isDefault: true,
          price: 135_000,
          sortOrder: 1,
        }),
        initialStock: 3,
      },
      params: { id: productId },
    })
    expect(added.status).toBe(201)
    let detail = await getAdminProduct(productId)
    expect(detail.variants.map((variant) => [variant.sku, variant.isDefault])).toEqual([
      ['VLR-HB-100-BLK', false],
      ['VLR-HB-100-TAN', true],
    ])
    expect(await prisma.product.findUniqueOrThrow({ where: { id: productId } })).toMatchObject({
      minPrice: 120_000,
      maxPrice: 135_000,
    })

    await call(admin.client, uploadRoute, { form: await photo(), params: { id: productId } })
    await call(admin.client, updateProductRoute, {
      method: 'PUT',
      body: productBody(category.id, { status: 'PUBLISHED' }),
      params: { id: productId },
    })
    const [black, tan] = detail.variants
    expect(
      (
        await call(admin.client, updateVariantRoute, {
          method: 'PUT',
          body: variantBody({ isActive: false, isDefault: false }),
          params: { id: black!.id },
        })
      ).status,
    ).toBe(200)
    const lastOne = await call(admin.client, updateVariantRoute, {
      method: 'PUT',
      body: variantBody({ sku: 'VLR-HB-100-TAN', isActive: false, price: 135_000 }),
      params: { id: tan!.id },
    })
    expect(lastOne.status).toBe(422)
    expect(lastOne.body.error?.fieldErrors).toHaveProperty('isActive')
    detail = await getAdminProduct(productId)
    expect(detail.variants.filter((variant) => variant.isActive)).toHaveLength(1)
  })

  it('adjusts stock with a reason and never below what open orders reserve', async () => {
    const admin = await signedInStaff('cat-stock@example.test', 'ADMIN')
    const order = await confirmedOrder('reserved-unit@example.test', { stock: 3 })
    const variantId = order.variant.id
    const restock = await call(admin.client, stockRoute, {
      body: { type: 'RESTOCK', quantity: 5, reason: 'PO-1042' },
      params: { id: variantId },
    })
    expect(restock.status).toBe(200)
    expect(await prisma.inventory.findUniqueOrThrow({ where: { variantId } })).toMatchObject({
      onHand: 7,
      reserved: 0,
    })

    const count = await call(admin.client, stockRoute, {
      body: { type: 'COUNT', counted: 6, reason: 'Monthly count' },
      params: { id: variantId },
    })
    expect(count.body.data).toMatchObject({ stock: { onHand: 6, delta: -1 } })
    const movements = await prisma.inventoryTransaction.findMany({
      where: { variantId },
      orderBy: { createdAt: 'asc' },
    })
    // (The test factory seeds stock directly, so there is no INITIAL row here.)
    expect(movements.map((movement) => movement.type)).toEqual([
      'RESERVATION',
      'SALE',
      'RESTOCK',
      'MANUAL_ADJUSTMENT',
    ])

    // A pending order holds one unit: writing off everything would sell stock we promised.
    const pending = await confirmedOrder('second-order@example.test', { stock: 1 })
    await prisma.inventory.update({
      where: { variantId: pending.variant.id },
      data: { reserved: 1, onHand: 1 },
    })
    const tooMuch = await call(admin.client, stockRoute, {
      body: { type: 'DAMAGE_WRITE_OFF', quantity: 1, reason: 'Water damage' },
      params: { id: pending.variant.id },
    })
    expect(tooMuch.status).toBe(409)
    expect(tooMuch.body.error?.details).toMatchObject({ reason: 'BELOW_RESERVED' })
  })

  it('archives instead of deleting products with orders', async () => {
    const admin = await signedInStaff('cat-delete@example.test', 'ADMIN')
    const sold = await confirmedOrder('bought-it@example.test')
    const refused = await call(admin.client, deleteProductRoute, {
      method: 'DELETE',
      params: { id: sold.product.id },
    })
    expect(refused.status).toBe(409)
    expect(refused.body.error?.details).toMatchObject({ reason: 'HAS_ORDERS' })

    const category = await createCategory({ slug: 'drafts' })
    const draft = await call(admin.client, createProductRoute, {
      body: {
        product: productBody(category.id, { sku: 'VLR-DRAFT', slugAr: 'مسودة', slugEn: 'draft' }),
        firstVariant: { variant: variantBody({ sku: 'VLR-DRAFT-1' }), initialStock: 1 },
      },
    })
    const draftId = (draft.body.data!.product as { id: string }).id
    await call(admin.client, uploadRoute, { form: await photo(), params: { id: draftId } })
    expect(
      (await call(admin.client, deleteProductRoute, { method: 'DELETE', params: { id: draftId } }))
        .status,
    ).toBe(204)
    expect(await prisma.product.count({ where: { id: draftId } })).toBe(0)
    expect(storage.files.size).toBe(0)
    expect((await listAdminProducts({ q: 'VLR-DRAFT' }, 1, 25)).total).toBe(0)
  })

  it('protects storefront routes and non-empty categories, and keeps staff to their permissions', async () => {
    const admin = await signedInStaff('cat-cats@example.test', 'ADMIN')
    const category = {
      slug: 'checkout',
      nameAr: 'الدفع',
      nameEn: 'Checkout',
      descriptionAr: null,
      descriptionEn: null,
      imageUrl: null,
      kind: 'STANDARD',
      gender: null,
      parentId: null,
      sortOrder: 0,
      isActive: true,
      showInNav: false,
      seoTitleAr: null,
      seoTitleEn: null,
      seoDescriptionAr: null,
      seoDescriptionEn: null,
    }
    const reserved = await call(admin.client, createCategoryRoute, { body: category })
    expect(reserved.status).toBe(422)
    expect(reserved.body.error?.fieldErrors).toHaveProperty('slug')

    const sold = await confirmedOrder('category-owner@example.test')
    const product = await prisma.product.findUniqueOrThrow({ where: { id: sold.product.id } })
    const notEmpty = await call(admin.client, deleteCategoryRoute, {
      method: 'DELETE',
      params: { id: product.categoryId },
    })
    expect(notEmpty.status).toBe(409)

    const staff = await signedInStaff('cat-staff@example.test')
    const brand = await call(staff.client, createBrandRoute, {
      body: {
        slug: 'noir',
        nameAr: 'نوار',
        nameEn: 'Noir',
        descriptionAr: null,
        descriptionEn: null,
        logoUrl: null,
        isActive: true,
      },
    })
    expect(brand.status).toBe(403)
    expect(await prisma.brand.count({ where: { slug: 'noir' } })).toBe(0)
  })
})
