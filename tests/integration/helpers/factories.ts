import { randomUUID } from 'node:crypto'
import { prisma } from '@/db/client'
import type { Gender, ProductStatus, RoleKey } from '@/generated/prisma/client'

/**
 * Minimal, explicit test-data builders. Each returns the created rows so tests
 * can assert on them. Defaults are valid; override only what a test cares about.
 */

let seq = 0
const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`

export async function ensureRoles(): Promise<void> {
  await prisma.role.createMany({
    data: [
      { key: 'CUSTOMER', nameAr: 'عميل', nameEn: 'Customer', permissions: [] },
      {
        key: 'STAFF',
        nameAr: 'موظف',
        nameEn: 'Staff',
        permissions: [
          'DASHBOARD_VIEW',
          'ORDERS_VIEW',
          'ORDERS_MANAGE',
          'PRODUCTS_VIEW',
          'INVENTORY_VIEW',
          'INVENTORY_ADJUST',
          'CUSTOMERS_VIEW',
          'REVIEWS_MODERATE',
          'MESSAGES_VIEW',
        ],
      },
      { key: 'ADMIN', nameAr: 'مدير', nameEn: 'Administrator', permissions: [] },
    ],
    skipDuplicates: true,
  })
}

export async function createUser(
  overrides: {
    email?: string
    role?: RoleKey
    name?: string
    passwordHash?: string
    status?: 'ACTIVE' | 'SUSPENDED'
  } = {},
) {
  await ensureRoles()
  return prisma.user.create({
    data: {
      email: overrides.email ?? `${unique('user')}@example.test`,
      name: overrides.name ?? 'Test User',
      passwordHash: overrides.passwordHash ?? 'not-a-real-hash',
      role: overrides.role ?? 'CUSTOMER',
      status: overrides.status ?? 'ACTIVE',
    },
  })
}

export async function createCategory(
  overrides: {
    slug?: string
    parentId?: string
    kind?: 'STANDARD' | 'GENDER' | 'NEW_ARRIVALS' | 'BEST_SELLERS' | 'OFFERS'
    gender?: Gender
  } = {},
) {
  const slug = overrides.slug ?? unique('cat')
  return prisma.category.create({
    data: {
      slug,
      nameAr: `فئة ${slug}`,
      nameEn: `Category ${slug}`,
      parentId: overrides.parentId,
      kind: overrides.kind ?? 'STANDARD',
      gender: overrides.gender,
    },
  })
}

export interface ProductFixtureOptions {
  price?: number
  compareAtPrice?: number | null
  stock?: number
  status?: ProductStatus
  categoryId?: string
  gender?: Gender
  nameEn?: string
  nameAr?: string
  variants?: Array<{
    stock: number
    price?: number | null
    nameEn?: string
    colorFamily?: 'BLACK' | 'BROWN' | 'BEIGE' | 'GOLD'
  }>
}

/** Product with one or more variants, each with an inventory row. */
export async function createProduct(options: ProductFixtureOptions = {}) {
  const categoryId = options.categoryId ?? (await createCategory()).id
  const price = options.price ?? 29_900
  const sku = unique('SKU').toUpperCase()
  const status = options.status ?? 'PUBLISHED'
  const variantSpecs = options.variants ?? [{ stock: options.stock ?? 10 }]
  const effectivePrices = variantSpecs.map((v) => v.price ?? price)
  const product = await prisma.product.create({
    data: {
      sku,
      slugAr: `منتج-${sku.toLowerCase()}`,
      slugEn: `product-${sku.toLowerCase()}`,
      nameAr: options.nameAr ?? `منتج ${sku}`,
      nameEn: options.nameEn ?? `Product ${sku}`,
      price,
      compareAtPrice: options.compareAtPrice ?? null,
      minPrice: Math.min(...effectivePrices),
      maxPrice: Math.max(...effectivePrices),
      categoryId,
      gender: options.gender ?? 'UNISEX',
      status,
      publishedAt: status === 'PUBLISHED' ? new Date() : null,
      searchText: `${(options.nameEn ?? `product ${sku}`).toLowerCase()} ${sku.toLowerCase()}`,
    },
  })
  const variants = []
  for (const [index, spec] of variantSpecs.entries()) {
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `${sku}-${index + 1}`,
        nameAr: `خيار ${index + 1}`,
        nameEn: spec.nameEn ?? `Option ${index + 1}`,
        price: spec.price ?? null,
        colorFamily: spec.colorFamily ?? null,
        isDefault: index === 0,
        sortOrder: index,
        inventory: { create: { onHand: spec.stock } },
      },
      include: { inventory: true },
    })
    variants.push(variant)
  }
  return { product, variants, variant: variants[0]! }
}

export function randomId(): string {
  return randomUUID()
}
