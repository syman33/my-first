import 'server-only'
import { prisma, type DbClient } from '@/db/client'
import { isUniqueViolation } from '@/db/errors'
import type { Prisma } from '@/generated/prisma/client'
import type { Locale } from '@/i18n/config'
import { availableUnits, effectivePrice, productHref, stockLevel } from '@/lib/catalog/presentation'
import { AppError, InsufficientStockError, InvalidCouponError, NotFoundError } from '@/lib/errors'
import {
  calculateOrderTotals,
  type PaymentMethodCode,
  type PricingLine,
  type ShippingMethodCode,
} from '@/lib/pricing/order-totals'
import { categoryAncestry, getActiveCategories } from '@/services/catalog/category.service'
import type {
  CheckoutSettings,
  CodSettings,
  ShippingSettings,
  TaxSettings,
} from '@/schemas/settings'
import { getSettings } from '@/services/settings/settings.service'
import type { CartLineView, CartView, ShopperOwner } from '@/types/cart'
import { addDays } from '@/utils/time'
import { GUEST_TTL_DAYS } from './guest-identity'
import { resolveCoupon } from './coupon.service'

/**
 * The shopping bag. The client only ever sends variant ids, quantities and a
 * coupon code; every price, discount, fee and total is computed here from
 * the database through the central pricing engine.
 */

function ownerWhere(owner: ShopperOwner): Prisma.CartWhereUniqueInput {
  return 'userId' in owner ? { userId: owner.userId } : { guestTokenHash: owner.guestTokenHash }
}

const lineSelect = {
  id: true,
  quantity: true,
  variant: {
    select: {
      id: true,
      sku: true,
      nameAr: true,
      nameEn: true,
      colorHex: true,
      price: true,
      compareAtPrice: true,
      isActive: true,
      imageId: true,
      inventory: { select: { onHand: true, reserved: true, lowStockThreshold: true } },
      product: {
        select: {
          id: true,
          slugAr: true,
          slugEn: true,
          nameAr: true,
          nameEn: true,
          price: true,
          compareAtPrice: true,
          status: true,
          publishedAt: true,
          lowStockThreshold: true,
          categoryId: true,
          category: { select: { isActive: true } },
          images: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            select: { id: true, url: true, altAr: true, altEn: true },
          },
        },
      },
    },
  },
} satisfies Prisma.CartItemSelect

export type LineRow = Prisma.CartItemGetPayload<{ select: typeof lineSelect }>

function isPurchasable(row: LineRow, now: Date): boolean {
  const product = row.variant.product
  return (
    row.variant.isActive &&
    product.status === 'PUBLISHED' &&
    product.publishedAt !== null &&
    product.publishedAt <= now &&
    product.category.isActive
  )
}

export interface CartOptions {
  shippingMethod?: ShippingMethodCode
  paymentMethod?: PaymentMethodCode | null
  userId?: string | null
  now?: Date
  /** Evaluate this code instead of the stored one (used before saving a new code). */
  couponCode?: string | null
}

/** Everything checkout needs beyond the view: raw rows and the resolved coupon. */
export interface CartPricing {
  view: CartView
  rows: LineRow[]
  coupon: { couponId: string; code: string } | null
  settings: {
    shipping: ShippingSettings
    tax: TaxSettings
    cod: CodSettings
    checkout: CheckoutSettings
  }
}

/**
 * Price the bag with a given database client: `prisma` for display, the
 * order transaction's client at checkout (so prices, stock and coupon rules
 * are re-read inside the transaction that creates the order).
 */
export async function priceCart(
  db: DbClient,
  owner: ShopperOwner | null,
  locale: Locale,
  options: CartOptions = {},
): Promise<CartPricing> {
  const now = options.now ?? new Date()
  const [cart, shipping, tax, cod, checkout, categories] = await Promise.all([
    owner
      ? db.cart.findUnique({
          where: ownerWhere(owner),
          select: {
            id: true,
            couponCode: true,
            items: { orderBy: { createdAt: 'asc' }, select: lineSelect },
          },
        })
      : null,
    getSettings('shipping', db),
    getSettings('tax', db),
    getSettings('cod', db),
    getSettings('checkout', db),
    getActiveCategories(),
  ])
  const ar = locale === 'ar'
  const rows = cart?.items ?? []

  const lines: CartLineView[] = rows.map((row) => {
    const { variant } = row
    const product = variant.product
    const purchasable = isPurchasable(row, now)
    const { price, compareAtPrice } = effectivePrice(product, variant)
    const available = availableUnits(variant.inventory)
    const threshold = variant.inventory?.lowStockThreshold ?? product.lowStockThreshold
    const image =
      product.images.find((img) => img.id === variant.imageId) ?? product.images[0] ?? null
    const issue: CartLineView['issue'] = !purchasable
      ? 'unavailable'
      : available <= 0
        ? 'out_of_stock'
        : row.quantity > available
          ? 'insufficient_stock'
          : row.quantity > checkout.maxQuantityPerItem
            ? 'quantity_limit'
            : null
    return {
      id: row.id,
      variantId: variant.id,
      productId: product.id,
      sku: variant.sku,
      name: ar ? product.nameAr : product.nameEn,
      variantName: ar ? variant.nameAr : variant.nameEn,
      href: productHref(locale, product),
      image: image
        ? {
            url: image.url,
            alt: (ar ? image.altAr : image.altEn) ?? (ar ? product.nameAr : product.nameEn),
          }
        : null,
      unitPrice: price,
      compareAtPrice,
      quantity: row.quantity,
      maxQuantity: Math.max(0, Math.min(available, checkout.maxQuantityPerItem)),
      stock: stockLevel(available, threshold),
      lineTotal: price * row.quantity,
      issue,
    }
  })

  // Only purchasable lines are priced; unavailable ones stay visible so the shopper can remove them.
  const pricingLines: PricingLine[] = rows.flatMap((row, index) => {
    const line = lines[index]!
    if (line.issue === 'unavailable') return []
    return [
      {
        variantId: row.variant.id,
        productId: row.variant.product.id,
        categoryIds: categoryAncestry(categories, row.variant.product.categoryId).map((c) => c.id),
        unitPrice: line.unitPrice,
        quantity: row.quantity,
      },
    ]
  })

  const couponCode =
    options.couponCode !== undefined ? options.couponCode : (cart?.couponCode ?? null)
  let couponFailure: CartView['couponIssue'] = null
  let couponRule = null
  let coupon: CartPricing['coupon'] = null
  if (couponCode) {
    const resolution = await resolveCoupon(couponCode, { userId: options.userId ?? null, now, db })
    if (resolution.ok) {
      couponRule = resolution.rule
      coupon = { couponId: resolution.couponId, code: resolution.rule.code }
    } else {
      couponFailure = { code: couponCode, reason: resolution.reason }
    }
  }

  const totals = calculateOrderTotals({
    lines: pricingLines,
    coupon: couponRule,
    shippingMethod: options.shippingMethod ?? 'STANDARD',
    paymentMethod: options.paymentMethod ?? null,
    settings: { shipping, tax, cod },
  })
  if (totals.coupon && !totals.coupon.applied) {
    coupon = null
    couponFailure = {
      code: totals.coupon.code,
      reason: totals.coupon.reason,
      ...(totals.coupon.minOrderAmount !== undefined
        ? { minOrderAmount: totals.coupon.minOrderAmount }
        : {}),
    }
  }

  return {
    view: {
      id: cart?.id ?? null,
      lines,
      totals,
      couponCode,
      couponIssue: couponFailure,
      hasIssues: lines.some((line) => line.issue !== null),
      maxQuantityPerItem: checkout.maxQuantityPerItem,
    },
    rows,
    coupon,
    settings: { shipping, tax, cod, checkout },
  }
}

/** Read the bag with live prices, stock checks and server-computed totals. */
export async function getCartView(
  owner: ShopperOwner | null,
  locale: Locale,
  options: CartOptions = {},
): Promise<CartView> {
  return (await priceCart(prisma, owner, locale, options)).view
}

// ---------------------------------------------------------------- mutations

async function ensureCart(db: DbClient, owner: ShopperOwner, now: Date): Promise<{ id: string }> {
  const expiresAt = 'guestTokenHash' in owner ? addDays(now, GUEST_TTL_DAYS) : null
  try {
    return await db.cart.upsert({
      where: ownerWhere(owner),
      create: {
        ...('userId' in owner
          ? { userId: owner.userId }
          : { guestTokenHash: owner.guestTokenHash }),
        expiresAt,
      },
      update: { expiresAt },
      select: { id: true },
    })
  } catch (error) {
    // Two first-adds raced to create the same cart: use the winner's.
    if (!isUniqueViolation(error)) throw error
    return db.cart.findUniqueOrThrow({ where: ownerWhere(owner), select: { id: true } })
  }
}

async function loadSellableVariant(db: DbClient, variantId: string, now: Date) {
  const variant = await db.productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      isActive: true,
      sku: true,
      inventory: { select: { onHand: true, reserved: true, lowStockThreshold: true } },
      product: {
        select: { status: true, publishedAt: true, category: { select: { isActive: true } } },
      },
    },
  })
  if (!variant) throw new NotFoundError('VARIANT_NOT_FOUND', 'Variant not found')
  const { product } = variant
  if (
    !variant.isActive ||
    product.status !== 'PUBLISHED' ||
    !product.publishedAt ||
    product.publishedAt > now ||
    !product.category.isActive
  ) {
    throw new AppError('PRODUCT_UNAVAILABLE', 'Product is not available', { status: 409 })
  }
  return { id: variant.id, sku: variant.sku, available: availableUnits(variant.inventory) }
}

function assertQuantity(
  quantity: number,
  variant: { id: string; sku: string; available: number },
  max: number,
): void {
  if (quantity > max) {
    throw new AppError('QUANTITY_LIMIT_EXCEEDED', 'Quantity above the per-item limit', {
      status: 422,
      details: { max },
    })
  }
  if (quantity > variant.available) {
    throw new InsufficientStockError([
      {
        variantId: variant.id,
        sku: variant.sku,
        requested: quantity,
        available: variant.available,
      },
    ])
  }
}

export async function addToCart(
  owner: ShopperOwner,
  input: { variantId: string; quantity: number },
  now = new Date(),
) {
  const { maxQuantityPerItem } = await getSettings('checkout')
  return prisma.$transaction(async (tx) => {
    const variant = await loadSellableVariant(tx, input.variantId, now)
    const cart = await ensureCart(tx, owner, now)
    // Atomic increment, then validate the result: concurrent adds cannot overshoot unnoticed.
    const item = await tx.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
      create: { cartId: cart.id, variantId: variant.id, quantity: input.quantity },
      update: { quantity: { increment: input.quantity } },
      select: { id: true, quantity: true },
    })
    assertQuantity(item.quantity, variant, maxQuantityPerItem)
    return item
  })
}

async function ownedItem(db: DbClient, owner: ShopperOwner, itemId: string) {
  const item = await db.cartItem.findFirst({
    where: {
      id: itemId,
      cart: 'userId' in owner ? { userId: owner.userId } : { guestTokenHash: owner.guestTokenHash },
    },
    select: { id: true, variantId: true, cartId: true, variant: { select: { productId: true } } },
  })
  // Someone else's item and a missing item look the same (no IDOR oracle).
  if (!item) throw new NotFoundError('NOT_FOUND', 'Cart item not found')
  return item
}

export async function updateCartItemQuantity(
  owner: ShopperOwner,
  itemId: string,
  quantity: number,
  now = new Date(),
) {
  const { maxQuantityPerItem } = await getSettings('checkout')
  return prisma.$transaction(async (tx) => {
    const item = await ownedItem(tx, owner, itemId)
    if (quantity === 0) {
      await tx.cartItem.delete({ where: { id: item.id } })
      return null
    }
    const variant = await loadSellableVariant(tx, item.variantId, now)
    assertQuantity(quantity, variant, maxQuantityPerItem)
    return tx.cartItem.update({
      where: { id: item.id },
      data: { quantity },
      select: { id: true, quantity: true },
    })
  })
}

export async function removeCartItem(owner: ShopperOwner, itemId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const item = await ownedItem(tx, owner, itemId)
    await tx.cartItem.delete({ where: { id: item.id } })
  })
}

export const MAX_WISHLIST_ITEMS = 200

/** Save for later: the item moves to the wishlist (keeping the chosen variant). */
export async function moveCartItemToWishlist(
  owner: ShopperOwner,
  itemId: string,
  now = new Date(),
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const item = await ownedItem(tx, owner, itemId)
    const expiresAt = 'guestTokenHash' in owner ? addDays(now, GUEST_TTL_DAYS) : null
    const wishlist = await tx.wishlist.upsert({
      where:
        'userId' in owner ? { userId: owner.userId } : { guestTokenHash: owner.guestTokenHash },
      create: {
        ...('userId' in owner
          ? { userId: owner.userId }
          : { guestTokenHash: owner.guestTokenHash }),
        expiresAt,
      },
      update: { expiresAt },
      select: { id: true, _count: { select: { items: true } } },
    })
    const exists = await tx.wishlistItem.findUnique({
      where: {
        wishlistId_productId: { wishlistId: wishlist.id, productId: item.variant.productId },
      },
      select: { id: true },
    })
    if (!exists && wishlist._count.items >= MAX_WISHLIST_ITEMS) {
      throw new AppError('QUANTITY_LIMIT_EXCEEDED', 'Wishlist is full', {
        status: 409,
        details: { max: MAX_WISHLIST_ITEMS },
      })
    }
    await tx.wishlistItem.upsert({
      where: {
        wishlistId_productId: { wishlistId: wishlist.id, productId: item.variant.productId },
      },
      create: {
        wishlistId: wishlist.id,
        productId: item.variant.productId,
        variantId: item.variantId,
      },
      update: { variantId: item.variantId },
    })
    await tx.cartItem.delete({ where: { id: item.id } })
  })
}

/** Validate a code against the current bag; it is stored only when it applies. */
export async function applyCouponToCart(
  owner: ShopperOwner,
  code: string,
  options: { userId: string | null; locale: Locale; now?: Date },
): Promise<void> {
  const now = options.now ?? new Date()
  const resolution = await resolveCoupon(code, { userId: options.userId, now })
  if (!resolution.ok) throw new InvalidCouponError(resolution.reason)
  const view = await getCartView(owner, options.locale, {
    userId: options.userId,
    now,
    couponCode: resolution.rule.code,
  })
  if (!view.id || view.totals.itemCount === 0)
    throw new AppError('CART_EMPTY', 'Cart is empty', { status: 422 })
  if (view.couponIssue) {
    throw new InvalidCouponError(
      view.couponIssue.reason,
      view.couponIssue.minOrderAmount !== undefined
        ? { minOrderAmount: view.couponIssue.minOrderAmount }
        : {},
    )
  }
  await prisma.cart.update({ where: { id: view.id }, data: { couponCode: resolution.rule.code } })
}

export async function removeCouponFromCart(owner: ShopperOwner): Promise<void> {
  await prisma.cart.updateMany({
    where: 'userId' in owner ? { userId: owner.userId } : { guestTokenHash: owner.guestTokenHash },
    data: { couponCode: null },
  })
}
