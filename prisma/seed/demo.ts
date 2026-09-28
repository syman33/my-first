import type { PrismaClient } from '../../src/generated/prisma/client'
import { hashPassword } from '../../src/lib/auth/password'
import { generateToken, hashToken } from '../../src/lib/security/tokens'
import { sarToHalalas } from '../../src/utils/money'
import { buildSearchDocument } from '../../src/utils/text'
import { addDays } from '../../src/utils/time'
import { slugify } from '../../src/utils/text'
import {
  brands,
  categories as seedCategories,
  colorKey,
  detailImagePath,
  PRODUCT_IMAGE_SIZE,
  products,
  variantImagePath,
} from './data/catalog'
import {
  banners,
  coupons,
  customers,
  DEMO_CUSTOMER_PASSWORD,
  DEV_PASSWORD,
  devStaffAccounts,
  newsletterEmails,
} from './data/people'

/**
 * Demo data for development, testing and non-public staging demos. Never runs
 * in production (enforced by seed/index.ts). Idempotent: existing rows
 * (matched by SKU / slug / email / code) are left untouched.
 */
export async function seedDemo(prisma: PrismaClient, now: Date = new Date()): Promise<void> {
  // Brands
  const brandIds = new Map<string, string>()
  for (const brand of brands) {
    const row = await prisma.brand.upsert({
      where: { slug: brand.slug },
      create: { slug: brand.slug, nameAr: brand.nameAr, nameEn: brand.nameEn },
      update: {},
    })
    brandIds.set(brand.slug, row.id)
  }

  const categoryRows = await prisma.category.findMany()
  const categoryBySlug = new Map(categoryRows.map((c) => [c.slug, c]))

  // Products, variants, images, inventory (+ INITIAL ledger rows)
  for (const product of products) {
    if (await prisma.product.findUnique({ where: { sku: product.sku }, select: { id: true } })) continue
    const category = categoryBySlug.get(product.category)
    if (!category) throw new Error(`Seed category missing: ${product.category}`)
    const parent = category.parentId ? categoryRows.find((c) => c.id === category.parentId) : undefined
    const brand = brands.find((b) => b.slug === product.brand)
    const basePrice = sarToHalalas(product.price)
    const effective = product.variants.map((v) => (v.price !== undefined ? sarToHalalas(v.price) : basePrice))
    const publishedAt = addDays(now, -product.ageDays)
    const seedCategory = seedCategories.find((c) => c.slug === product.category)

    await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          sku: product.sku,
          slugEn: slugify(product.nameEn),
          slugAr: slugify(product.nameAr),
          nameAr: product.nameAr,
          nameEn: product.nameEn,
          descriptionAr: product.descriptionAr,
          descriptionEn: product.descriptionEn,
          price: basePrice,
          compareAtPrice: product.compareAt ? sarToHalalas(product.compareAt) : null,
          cost: sarToHalalas(product.cost),
          minPrice: Math.min(...effective),
          maxPrice: Math.max(...effective),
          categoryId: category.id,
          brandId: brandIds.get(product.brand) ?? null,
          gender: product.gender,
          materialAr: product.materialAr,
          materialEn: product.materialEn,
          lengthMm: product.dimensionsMm?.[0] ?? null,
          widthMm: product.dimensionsMm?.[1] ?? null,
          heightMm: product.dimensionsMm?.[2] ?? null,
          weightGrams: product.weightGrams ?? null,
          careAr: product.careAr,
          careEn: product.careEn,
          isFeatured: product.featured ?? false,
          isBestseller: product.bestseller ?? false,
          isNewArrival: product.newArrival ?? false,
          status: 'PUBLISHED',
          publishedAt,
          salesCount: product.salesCount,
          createdAt: publishedAt,
          searchText: buildSearchDocument([
            product.nameAr,
            product.nameEn,
            product.sku,
            ...product.variants.map((v) => `${product.sku}-${v.suffix}`),
            brand?.nameAr,
            brand?.nameEn,
            category.nameAr,
            category.nameEn,
            parent?.nameAr,
            parent?.nameEn,
            seedCategory?.nameEn,
            ...product.variants.flatMap((v) => [v.colorAr, v.colorEn]),
            product.materialAr,
            product.materialEn,
          ]),
        },
      })

      // One image per distinct colour, then the detail shot as the hover image.
      const imageIdByColor = new Map<string, string>()
      let sortOrder = 0
      const firstVariant = product.variants[0]!
      const orderedColors = [...new Map(product.variants.map((v) => [colorKey(v), v])).values()]
      for (const variant of orderedColors) {
        const image = await tx.productImage.create({
          data: {
            productId: created.id,
            url: variantImagePath(product, variant),
            altAr: `${product.nameAr} باللون ${variant.colorAr}`,
            altEn: `${product.nameEn} in ${variant.colorEn}`,
            width: PRODUCT_IMAGE_SIZE.width,
            height: PRODUCT_IMAGE_SIZE.height,
            sortOrder: sortOrder === 0 ? 0 : sortOrder + 1,
          },
        })
        imageIdByColor.set(colorKey(variant), image.id)
        sortOrder++
      }
      await tx.productImage.create({
        data: {
          productId: created.id,
          url: detailImagePath(product),
          altAr: `تفاصيل ${product.nameAr}`,
          altEn: `${product.nameEn} detail`,
          width: PRODUCT_IMAGE_SIZE.width,
          height: PRODUCT_IMAGE_SIZE.height,
          sortOrder: 1,
        },
      })

      for (const [index, variant] of product.variants.entries()) {
        const nameParts = { ar: [variant.colorAr], en: [variant.colorEn] }
        if (variant.size) {
          nameParts.ar.push(`مقاس ${variant.size}`)
          nameParts.en.push(`Size ${variant.size}`)
        }
        const createdVariant = await tx.productVariant.create({
          data: {
            productId: created.id,
            sku: `${product.sku}-${variant.suffix}`,
            nameAr: nameParts.ar.join(' / '),
            nameEn: nameParts.en.join(' / '),
            colorFamily: variant.colorFamily,
            colorNameAr: variant.colorAr,
            colorNameEn: variant.colorEn,
            colorHex: variant.hex,
            size: variant.size ?? null,
            price: variant.price !== undefined ? sarToHalalas(variant.price) : null,
            compareAtPrice: variant.compareAt !== undefined ? sarToHalalas(variant.compareAt) : null,
            imageId: imageIdByColor.get(colorKey(variant)) ?? null,
            isDefault: variant === firstVariant,
            sortOrder: index,
            inventory: { create: { onHand: variant.stock } },
          },
        })
        if (variant.stock > 0) {
          await tx.inventoryTransaction.create({
            data: {
              variantId: createdVariant.id,
              type: 'INITIAL',
              quantityDelta: variant.stock,
              previousOnHand: 0,
              newOnHand: variant.stock,
              previousReserved: 0,
              newReserved: 0,
              reason: 'Initial demo stock',
              actorType: 'SYSTEM',
              createdAt: publishedAt,
            },
          })
        }
      }
    })
  }

  // Development staff accounts (development/test only — see index.ts).
  const devHash = await hashPassword(DEV_PASSWORD)
  for (const account of devStaffAccounts) {
    await prisma.user.upsert({
      where: { email: account.email },
      create: { ...account, passwordHash: devHash, emailVerifiedAt: now, locale: 'ar' },
      update: {},
    })
  }

  // Demo customers with addresses.
  const customerHash = await hashPassword(DEMO_CUSTOMER_PASSWORD)
  for (const customer of customers) {
    if (await prisma.user.findUnique({ where: { email: customer.email }, select: { id: true } })) continue
    const joined = addDays(now, -customer.joinedDaysAgo)
    await prisma.user.create({
      data: {
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        locale: customer.locale,
        passwordHash: customerHash,
        role: 'CUSTOMER',
        emailVerifiedAt: joined,
        createdAt: joined,
        lastLoginAt: addDays(now, -Math.min(3, customer.joinedDaysAgo)),
        addresses: {
          create: customer.addresses.map((address, index) => ({
            label: address.label,
            fullName: customer.name,
            phone: customer.phone,
            city: address.city,
            district: address.district,
            street: address.street,
            buildingNumber: address.buildingNumber,
            postalCode: address.postalCode,
            additionalNumber: address.additionalNumber ?? null,
            isDefault: index === 0,
          })),
        },
      },
    })
  }

  // Coupons.
  for (const coupon of coupons) {
    if (await prisma.coupon.findUnique({ where: { code: coupon.code }, select: { id: true } })) continue
    const scopedCategories = (coupon.categorySlugs ?? []).map((slug) => categoryBySlug.get(slug)?.id).filter((id): id is string => !!id)
    await prisma.coupon.create({
      data: {
        code: coupon.code,
        descriptionAr: coupon.descriptionAr,
        descriptionEn: coupon.descriptionEn,
        type: coupon.type,
        value: coupon.type === 'PERCENTAGE' ? coupon.value * 100 : sarToHalalas(coupon.value),
        minOrderAmount: coupon.minOrderSar !== undefined ? sarToHalalas(coupon.minOrderSar) : null,
        maxDiscountAmount: coupon.maxDiscountSar !== undefined ? sarToHalalas(coupon.maxDiscountSar) : null,
        usageLimit: coupon.usageLimit ?? null,
        usageLimitPerUser: coupon.usageLimitPerUser ?? null,
        startsAt: coupon.startsInDays !== undefined ? addDays(now, coupon.startsInDays) : null,
        expiresAt: coupon.expiresInDays !== undefined ? addDays(now, coupon.expiresInDays) : null,
        scope: coupon.scope ?? 'ALL',
        isActive: coupon.isActive,
        categories: scopedCategories.length ? { create: scopedCategories.map((categoryId) => ({ categoryId })) } : undefined,
      },
    })
  }

  // Banners.
  if ((await prisma.banner.count()) === 0) {
    for (const banner of banners) {
      const { startsInDays, endsInDays, ...data } = banner as typeof banner & { startsInDays?: number; endsInDays?: number }
      await prisma.banner.create({
        data: {
          ...data,
          startsAt: startsInDays !== undefined ? addDays(now, startsInDays) : null,
          endsAt: endsInDays !== undefined ? addDays(now, endsInDays) : null,
        },
      })
    }
  }

  // Newsletter subscribers.
  for (const subscriber of newsletterEmails) {
    await prisma.newsletterSubscriber.upsert({
      where: { email: subscriber.email },
      create: {
        email: subscriber.email,
        locale: subscriber.locale,
        status: subscriber.unsubscribed ? 'UNSUBSCRIBED' : 'SUBSCRIBED',
        unsubscribedAt: subscriber.unsubscribed ? addDays(now, -5) : null,
        unsubscribeTokenHash: hashToken(generateToken()),
        source: 'seed',
      },
      update: {},
    })
  }
}
