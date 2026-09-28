import { describe, expect, it } from 'vitest'
import { prisma } from '@/db/client'
import { isCheckViolation, isUniqueViolation } from '@/db/errors'
import { createProduct, createUser } from '../helpers/factories'

/**
 * The database is the last line of defence: these invariants must hold even if
 * application code has a bug.
 */
describe('database invariants', () => {
  it('migrations applied: sequences and extensions exist', async () => {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`
    expect(rows[0]?.n).toBe(1n)
    const ext = await prisma.$queryRaw<{ extname: string }[]>`SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm','citext') ORDER BY 1`
    expect(ext.map((e) => e.extname)).toEqual(['citext', 'pg_trgm'])
  })

  it('stock can never become negative', async () => {
    const { variant } = await createProduct({ stock: 2 })
    await expect(prisma.inventory.update({ where: { variantId: variant.id }, data: { onHand: -1 } })).rejects.toSatisfy(
      (e) => isCheckViolation(e, 'inventory_on_hand_nonneg'),
    )
  })

  it('reservations can never exceed stock on hand', async () => {
    const { variant } = await createProduct({ stock: 2 })
    await expect(prisma.inventory.update({ where: { variantId: variant.id }, data: { reserved: 3 } })).rejects.toSatisfy(
      (e) => isCheckViolation(e, 'inventory_reserved_valid'),
    )
    await expect(prisma.inventory.update({ where: { variantId: variant.id }, data: { reserved: -1 } })).rejects.toSatisfy(
      (e) => isCheckViolation(e, 'inventory_reserved_valid'),
    )
  })

  it('ledger rows must be arithmetically consistent', async () => {
    const { variant } = await createProduct({ stock: 5 })
    await expect(
      prisma.inventoryTransaction.create({
        data: {
          variantId: variant.id,
          type: 'MANUAL_ADJUSTMENT',
          quantityDelta: 3,
          previousOnHand: 5,
          newOnHand: 9, // should be 8
          previousReserved: 0,
          newReserved: 0,
          actorType: 'SYSTEM',
        },
      }),
    ).rejects.toSatisfy((e) => isCheckViolation(e, 'inventory_tx_consistent'))
  })

  it('order totals must add up (tax-inclusive and tax-exclusive)', async () => {
    const user = await createUser()
    const base = {
      userId: user.id,
      paymentMethod: 'CARD' as const,
      shippingMethod: 'STANDARD' as const,
      taxRateBps: 1500,
      shippingName: 'Test',
      shippingPhone: '+966500000000',
      shippingEmail: 'a@b.test',
      shippingCity: 'الرياض',
      shippingDistrict: 'العليا',
      shippingStreet: 'طريق الملك فهد',
      shippingBuilding: '1234',
      shippingPostalCode: '12345',
    }
    // inclusive: 100 - 10 + 20 = 110 (tax contained)
    await expect(
      prisma.order.create({
        data: { ...base, orderNumber: 'T-1', subtotal: 10_000, discountTotal: 1_000, shippingTotal: 2_000, taxTotal: 1_435, total: 11_000, pricesIncludeTax: true },
      }),
    ).resolves.toBeTruthy()
    // exclusive: tax must be added → 100 + 15 = 115, 100 alone is rejected
    await expect(
      prisma.order.create({
        data: { ...base, orderNumber: 'T-2', subtotal: 10_000, taxTotal: 1_500, total: 10_000, pricesIncludeTax: false },
      }),
    ).rejects.toSatisfy((e) => isCheckViolation(e, 'orders_total_consistent'))
    // discount larger than subtotal is impossible
    await expect(
      prisma.order.create({
        data: { ...base, orderNumber: 'T-3', subtotal: 1_000, discountTotal: 2_000, total: 0, pricesIncludeTax: true },
      }),
    ).rejects.toSatisfy((e) => isCheckViolation(e))
  })

  it('emails are unique case-insensitively', async () => {
    await createUser({ email: 'Layla@Example.test' })
    await expect(createUser({ email: 'layla@example.TEST' })).rejects.toSatisfy((e) => isUniqueViolation(e))
  })

  it('a cart must have exactly one owner', async () => {
    const user = await createUser()
    await expect(prisma.cart.create({ data: {} })).rejects.toSatisfy((e) => isCheckViolation(e, 'carts_single_owner'))
    await expect(prisma.cart.create({ data: { userId: user.id, guestTokenHash: 'x'.repeat(64) } })).rejects.toSatisfy((e) =>
      isCheckViolation(e, 'carts_single_owner'),
    )
    await expect(prisma.cart.create({ data: { userId: user.id } })).resolves.toBeTruthy()
  })

  it('cart quantities are bounded', async () => {
    const user = await createUser()
    const { variant } = await createProduct()
    const cart = await prisma.cart.create({ data: { userId: user.id } })
    await expect(prisma.cartItem.create({ data: { cartId: cart.id, variantId: variant.id, quantity: 0 } })).rejects.toSatisfy((e) =>
      isCheckViolation(e, 'cart_items_quantity_range'),
    )
    await expect(prisma.cartItem.create({ data: { cartId: cart.id, variantId: variant.id, quantity: 100 } })).rejects.toSatisfy((e) =>
      isCheckViolation(e, 'cart_items_quantity_range'),
    )
  })

  it('coupon usage cannot exceed its limit', async () => {
    const coupon = await prisma.coupon.create({ data: { code: 'LIMIT1', type: 'PERCENTAGE', value: 1000, usageLimit: 1 } })
    await prisma.coupon.update({ where: { id: coupon.id }, data: { usedCount: 1 } })
    await expect(prisma.coupon.update({ where: { id: coupon.id }, data: { usedCount: 2 } })).rejects.toSatisfy((e) =>
      isCheckViolation(e, 'coupons_usage_valid'),
    )
    await expect(prisma.coupon.create({ data: { code: 'BAD', type: 'PERCENTAGE', value: 20_000 } })).rejects.toSatisfy((e) =>
      isCheckViolation(e, 'coupons_value_valid'),
    )
  })

  it('only one default variant per product', async () => {
    const { product, variant } = await createProduct({ variants: [{ stock: 1 }, { stock: 1 }] })
    const other = await prisma.productVariant.findFirstOrThrow({ where: { productId: product.id, id: { not: variant.id } } })
    await expect(prisma.productVariant.update({ where: { id: other.id }, data: { isDefault: true } })).rejects.toSatisfy((e) =>
      isUniqueViolation(e),
    )
  })

  it('the audit log is append-only', async () => {
    const actor = await createUser({ role: 'ADMIN' })
    const entry = await prisma.auditLog.create({
      data: { actorId: actor.id, actorType: 'ADMIN', action: 'test.created', entityType: 'test', entityId: '1' },
    })
    await expect(prisma.auditLog.update({ where: { id: entry.id }, data: { action: 'tampered' } })).rejects.toThrow(/append-only/)
    await expect(prisma.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(/append-only/)
    await expect(prisma.user.delete({ where: { id: actor.id } })).rejects.toBeTruthy() // attribution is protected
  })
})
