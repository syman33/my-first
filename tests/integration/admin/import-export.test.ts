import { describe, expect, it } from 'vitest'
import { GET as exportOrdersRoute } from '@/app/api/admin/export/orders/route'
import { GET as exportProductsRoute } from '@/app/api/admin/export/products/route'
import { POST as importRoute } from '@/app/api/admin/import/products/route'
import { prisma } from '@/db/client'
import { placeOrder, readyToCheckout, signedInStaff } from '../helpers/checkout'
import { createCategory, createProduct } from '../helpers/factories'
import type { TestClient } from '../helpers/http'

type Report = {
  ok: boolean
  applied: boolean
  issues: { row: number; column: string | null; code: string }[]
  summary: Record<string, number>
}
type Body = { data?: { report: Report }; error?: { code: string; details?: { report?: Report } } }

function upload(client: TestClient, csv: string, mode: 'check' | 'apply') {
  const form = new FormData()
  form.set('file', new File([csv], 'catalogue.csv', { type: 'text/csv' }))
  form.set('mode', mode)
  return client.call<Body>(importRoute, { form })
}

const header =
  'product_sku,name_ar,name_en,category,price,variant_sku,variant_name_ar,variant_name_en,stock'

describe('product import', () => {
  it('checks without writing, then creates drafts and adjusts stock in one transaction', async () => {
    const admin = await signedInStaff('import-admin@example.test', 'ADMIN')
    await createCategory({ slug: 'bags' })
    const existing = await createProduct({ stock: 10, price: 50_000 })
    const csv = [
      header,
      'VLR-NEW-01,حقيبة جديدة,New Tote,bags,450.00,VLR-NEW-01-BLK,أسود,Black,6',
      'VLR-NEW-01,,,,,VLR-NEW-01-TAN,بني,Tan,',
      `${existing.product.sku},,,,,${existing.variant.sku},,,4`,
    ].join('\n')

    const checked = await upload(admin.client, csv, 'check')
    expect(checked.status).toBe(200)
    expect(checked.body.data?.report).toMatchObject({
      ok: true,
      applied: false,
      summary: { productsCreated: 1, variantsCreated: 2, stockChanges: 1 },
    })
    expect(await prisma.product.count()).toBe(1)

    const applied = await upload(admin.client, csv, 'apply')
    expect(applied.status).toBe(200)
    expect(applied.body.data?.report.applied).toBe(true)
    const created = await prisma.product.findUniqueOrThrow({
      where: { sku: 'VLR-NEW-01' },
      include: { variants: { include: { inventory: true }, orderBy: { sortOrder: 'asc' } } },
    })
    expect(created).toMatchObject({
      status: 'DRAFT',
      price: 45_000,
      slugEn: 'new-tote',
      minPrice: 45_000,
    })
    expect(
      created.variants.map((variant) => [
        variant.sku,
        variant.isDefault,
        variant.inventory?.onHand,
      ]),
    ).toEqual([
      ['VLR-NEW-01-BLK', true, 6],
      ['VLR-NEW-01-TAN', false, 0],
    ])
    expect(
      await prisma.inventory.findUniqueOrThrow({ where: { variantId: existing.variant.id } }),
    ).toMatchObject({ onHand: 4 })
    expect(await prisma.inventoryTransaction.count({ where: { type: 'IMPORT' } })).toBe(2)
    expect(await prisma.auditLog.count({ where: { action: 'catalog.imported' } })).toBe(1)
  })

  it('applies nothing when any row is wrong, and explains every problem', async () => {
    const admin = await signedInStaff('import-errors@example.test', 'ADMIN')
    await createCategory({ slug: 'bags' })
    const busy = await createProduct({ stock: 5 })
    await prisma.inventory.update({ where: { variantId: busy.variant.id }, data: { reserved: 3 } })
    const csv = [
      header,
      'VLR-GOOD-01,حقيبة,Good Bag,bags,100,VLR-GOOD-01-A,أ,A,1',
      'VLR-BAD-01,حقيبة,Bad Bag,shoes,100,VLR-BAD-01-A,أ,A,1',
      `${busy.product.sku},,,,,${busy.variant.sku},,,2`,
      `VLR-BAD-02,حقيبة,Other,bags,100,${busy.variant.sku},أ,A,1`,
    ].join('\n')
    const res = await upload(admin.client, csv, 'apply')
    expect(res.status).toBe(422)
    expect(res.body.error?.code).toBe('IMPORT_INVALID')
    expect(res.body.error?.details?.report?.issues).toEqual([
      { row: 3, column: 'category', code: 'unknownCategory' },
      { row: 4, column: 'stock', code: 'belowReserved' },
      { row: 5, column: 'variant_sku', code: 'duplicateInFile' },
      // Rows 2 and 5 are both new products named "حقيبة": their Arabic slugs collide.
      { row: 5, column: 'slug_ar', code: 'slugTaken' },
    ])
    expect(await prisma.product.count({ where: { sku: 'VLR-GOOD-01' } })).toBe(0)
    expect(
      await prisma.inventory.findUniqueOrThrow({ where: { variantId: busy.variant.id } }),
    ).toMatchObject({ onHand: 5 })
  })

  it('needs the import permission plus product and stock rights', async () => {
    const staff = await signedInStaff('import-staff@example.test')
    expect((await upload(staff.client, `${header}\n`, 'check')).status).toBe(403)
    await prisma.role.update({
      where: { key: 'STAFF' },
      data: { permissions: { push: 'IMPORT_EXPORT' } },
    })
    // Default staff can adjust stock but not edit products.
    expect((await upload(staff.client, `${header}\n`, 'check')).status).toBe(403)
  })
})

describe('exports', () => {
  it('exports the catalogue in the import format and orders for accounting', async () => {
    const admin = await signedInStaff('export-admin@example.test', 'ADMIN')
    const shopper = await readyToCheckout('export-shopper@example.test', { price: 40_000 })
    const placed = await placeOrder(shopper.client, shopper.address.id, { paymentMethod: 'COD' })
    expect(placed.status).toBe(200)

    const products = await admin.client.call<string>(exportProductsRoute)
    expect(products.status).toBe(200)
    expect(products.headers.get('content-type')).toContain('text/csv')
    expect(products.body).toContain(shopper.variant.sku)

    const orders = await admin.client.call<string>(exportOrdersRoute, {
      path: '/api/admin/export/orders?status=PENDING',
    })
    expect(orders.status).toBe(200)
    expect(orders.body).toContain(placed.body.data!.order.orderNumber)
    expect(orders.body).toContain('400.00')
    expect(
      await prisma.auditLog.count({
        where: { action: { in: ['catalog.exported', 'orders.exported'] } },
      }),
    ).toBe(2)
  })
})
