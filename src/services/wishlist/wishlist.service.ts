import 'server-only'
import { cache } from 'react'
import { prisma } from '@/db/client'
import type { Prisma } from '@/generated/prisma/client'
import type { Locale } from '@/i18n/config'
import { toProductCard } from '@/lib/catalog/presentation'
import { AppError, NotFoundError, ValidationError } from '@/lib/errors'
import { getCurrentSession, getGuestTokenHash } from '@/lib/auth/current-user'
import { addToCart, MAX_WISHLIST_ITEMS } from '@/services/cart/cart.service'
import { productCardSelect, visibleProductWhere } from '@/services/catalog/listing.service'
import type { ShopperOwner } from '@/types/cart'
import type { WishlistEntryView } from '@/types/wishlist'
import { addDays } from '@/utils/time'
import { GUEST_TTL_DAYS } from '@/services/cart/guest-identity'

function ownerWhere(owner: ShopperOwner): Prisma.WishlistWhereUniqueInput {
  return 'userId' in owner ? { userId: owner.userId } : { guestTokenHash: owner.guestTokenHash }
}

/** The current shopper (from cookies) for Server Components; null when there is none yet. */
export const currentShopper = cache(async (): Promise<ShopperOwner | null> => {
  const session = await getCurrentSession()
  if (session) return { userId: session.user.id }
  const guestTokenHash = await getGuestTokenHash()
  return guestTokenHash ? { guestTokenHash } : null
})

/** Product ids in the current shopper's wishlist (to draw filled hearts). */
export const getWishlistProductIds = cache(async (): Promise<Set<string>> => {
  const owner = await currentShopper()
  if (!owner) return new Set()
  const items = await prisma.wishlistItem.findMany({
    where: {
      wishlist:
        'userId' in owner ? { userId: owner.userId } : { guestTokenHash: owner.guestTokenHash },
    },
    select: { productId: true },
  })
  return new Set(items.map((item) => item.productId))
})

export async function getWishlistView(
  owner: ShopperOwner | null,
  locale: Locale,
  now = new Date(),
): Promise<WishlistEntryView[]> {
  if (!owner) return []
  const wishlist = await prisma.wishlist.findUnique({
    where: ownerWhere(owner),
    select: {
      items: {
        orderBy: { createdAt: 'desc' },
        select: {
          productId: true,
          variantId: true,
          createdAt: true,
          product: {
            select: {
              ...productCardSelect,
              status: true,
              publishedAt: true,
              category: { select: { ...productCardSelect.category.select, isActive: true } },
            },
          },
        },
      },
    },
  })
  return (wishlist?.items ?? []).map((item) => {
    const { product } = item
    const available =
      product.status === 'PUBLISHED' &&
      product.publishedAt !== null &&
      product.publishedAt <= now &&
      product.category.isActive
    const card = toProductCard(product, locale)
    // A remembered variant (e.g. saved from the bag) is preferred for "move to bag".
    const preferred = item.variantId
      ? product.variants.find((v) => v.id === item.variantId)
      : undefined
    const preferredSellable =
      preferred && (preferred.inventory?.onHand ?? 0) - (preferred.inventory?.reserved ?? 0) > 0
    return {
      productId: item.productId,
      addedAt: item.createdAt,
      available,
      card,
      moveVariantId: available ? (preferredSellable ? preferred.id : card.quickAddVariantId) : null,
    }
  })
}

export async function addToWishlist(
  owner: ShopperOwner,
  input: { productId: string; variantId?: string | null },
  now = new Date(),
) {
  const product = await prisma.product.findFirst({
    where: { AND: [visibleProductWhere(now), { id: input.productId }] },
    select: { id: true, variants: { where: { isActive: true }, select: { id: true } } },
  })
  if (!product) throw new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found')
  if (input.variantId && !product.variants.some((v) => v.id === input.variantId)) {
    throw new NotFoundError('VARIANT_NOT_FOUND', 'Variant not found')
  }
  const expiresAt = 'guestTokenHash' in owner ? addDays(now, GUEST_TTL_DAYS) : null
  await prisma.$transaction(async (tx) => {
    const wishlist = await tx.wishlist.upsert({
      where: ownerWhere(owner),
      create: {
        ...('userId' in owner
          ? { userId: owner.userId }
          : { guestTokenHash: owner.guestTokenHash }),
        expiresAt,
      },
      update: { expiresAt },
      select: { id: true, _count: { select: { items: true } } },
    })
    const existing = await tx.wishlistItem.findUnique({
      where: { wishlistId_productId: { wishlistId: wishlist.id, productId: product.id } },
      select: { id: true },
    })
    if (!existing && wishlist._count.items >= MAX_WISHLIST_ITEMS) {
      throw new AppError('QUANTITY_LIMIT_EXCEEDED', 'Wishlist is full', {
        status: 409,
        details: { max: MAX_WISHLIST_ITEMS },
      })
    }
    await tx.wishlistItem.upsert({
      where: { wishlistId_productId: { wishlistId: wishlist.id, productId: product.id } },
      create: {
        wishlistId: wishlist.id,
        productId: product.id,
        variantId: input.variantId ?? null,
      },
      update: input.variantId ? { variantId: input.variantId } : {},
    })
  })
}

export async function removeFromWishlist(owner: ShopperOwner, productId: string): Promise<void> {
  await prisma.wishlistItem.deleteMany({
    where: {
      productId,
      wishlist:
        'userId' in owner ? { userId: owner.userId } : { guestTokenHash: owner.guestTokenHash },
    },
  })
}

/** Move to bag: needs a concrete variant — the given one, the remembered one, or the only sellable one. */
export async function moveWishlistItemToCart(
  owner: ShopperOwner,
  input: { productId: string; variantId?: string | null },
  locale: Locale,
): Promise<void> {
  const entries = await getWishlistView(owner, locale)
  const entry = entries.find((e) => e.productId === input.productId)
  if (!entry) throw new NotFoundError('NOT_FOUND', 'Wishlist item not found')
  const variantId = input.variantId ?? entry.moveVariantId
  if (!variantId) {
    throw new ValidationError({ variantId: 'required' }, 'A variant must be chosen first')
  }
  await addToCart(owner, { variantId, quantity: 1 })
  await removeFromWishlist(owner, input.productId)
}
