import { describe, expect, it } from 'vitest'
import { prisma } from '@/db/client'
import { seedDemo } from '../../../prisma/seed/demo'
import { seedReference } from '../../../prisma/seed/reference'

describe('seed', () => {
  it('loads reference + demo data that satisfies every invariant, idempotently', async () => {
    await seedReference(prisma)
    await seedDemo(prisma)
    const snapshot = async () => ({
      products: await prisma.product.count(),
      variants: await prisma.productVariant.count(),
      images: await prisma.productImage.count(),
      ledger: await prisma.inventoryTransaction.count(),
      users: await prisma.user.count(),
      coupons: await prisma.coupon.count(),
      banners: await prisma.banner.count(),
      categories: await prisma.category.count(),
    })
    const first = await snapshot()
    expect(first.products).toBeGreaterThanOrEqual(30)
    expect(first.categories).toBeGreaterThanOrEqual(8)
    expect(first.coupons).toBeGreaterThanOrEqual(5)
    expect(first.banners).toBeGreaterThanOrEqual(5)
    expect(await prisma.user.count({ where: { role: 'CUSTOMER' } })).toBeGreaterThanOrEqual(10)

    // Re-running changes nothing.
    await seedReference(prisma)
    await seedDemo(prisma)
    expect(await snapshot()).toEqual(first)

    // Every product has exactly one default variant, inventory for every variant,
    // a primary image and consistent denormalised prices.
    const products = await prisma.product.findMany({
      include: { variants: { include: { inventory: true } }, images: true },
    })
    for (const product of products) {
      expect(product.variants.filter((v) => v.isDefault)).toHaveLength(1)
      expect(product.variants.every((v) => v.inventory !== null)).toBe(true)
      expect(product.images.some((i) => i.sortOrder === 0)).toBe(true)
      const effective = product.variants.map((v) => v.price ?? product.price)
      expect(product.minPrice).toBe(Math.min(...effective))
      expect(product.maxPrice).toBe(Math.max(...effective))
      expect(product.searchText.length).toBeGreaterThan(0)
    }

    // Ledger matches stock on hand for every variant.
    const variants = await prisma.productVariant.findMany({
      include: { inventory: true, movements: true },
    })
    for (const variant of variants) {
      const ledgerTotal = variant.movements.reduce((sum, m) => sum + m.quantityDelta, 0)
      expect(ledgerTotal).toBe(variant.inventory?.onHand)
    }

    // Development credentials are hashed, never stored in plaintext.
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@velora.local' } })
    expect(admin.role).toBe('ADMIN')
    expect(admin.passwordHash).toMatch(/^\$argon2id\$/)
    expect(admin.passwordHash).not.toContain('ChangeMe123!')
  })
})
