import 'server-only'
import type { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/db/client'
import { logger } from '@/lib/logger'
import { getSettings } from '@/services/settings/settings.service'
import { clearGuestCookie, readGuestTokenHash } from './guest-identity'

/**
 * When a guest signs in or registers, their guest cart and wishlist are
 * merged into the account:
 *  - quantities of the same variant are added, then clamped to the per-item
 *    limit and to the stock currently available (on hand − reserved);
 *  - items that are no longer purchasable are dropped;
 *  - the account's coupon wins; otherwise the guest's coupon carries over;
 *  - wishlists are unioned.
 * The guest records are deleted and the guest cookie cleared.
 */
export async function mergeGuestIntoUser(
  guestTokenHash: string,
  userId: string,
): Promise<{ mergedItems: number; mergedWishlist: number }> {
  const { maxQuantityPerItem } = await getSettings('checkout')
  return prisma.$transaction(async (tx) => {
    let mergedItems = 0
    let mergedWishlist = 0

    const guestCart = await tx.cart.findUnique({
      where: { guestTokenHash },
      include: {
        items: {
          include: {
            variant: {
              select: {
                isActive: true,
                product: { select: { status: true } },
                inventory: { select: { onHand: true, reserved: true } },
              },
            },
          },
        },
      },
    })
    if (guestCart) {
      const userCart =
        (await tx.cart.findUnique({ where: { userId }, include: { items: true } })) ??
        (await tx.cart.create({ data: { userId }, include: { items: true } }))
      for (const item of guestCart.items) {
        const sellable = item.variant.isActive && item.variant.product.status === 'PUBLISHED'
        const available = item.variant.inventory
          ? item.variant.inventory.onHand - item.variant.inventory.reserved
          : 0
        if (!sellable || available <= 0) continue
        const existing = userCart.items.find((i) => i.variantId === item.variantId)
        const quantity = Math.min(
          (existing?.quantity ?? 0) + item.quantity,
          maxQuantityPerItem,
          available,
        )
        if (quantity < 1) continue
        await tx.cartItem.upsert({
          where: { cartId_variantId: { cartId: userCart.id, variantId: item.variantId } },
          create: { cartId: userCart.id, variantId: item.variantId, quantity },
          update: { quantity },
        })
        mergedItems++
      }
      if (!userCart.couponCode && guestCart.couponCode) {
        await tx.cart.update({
          where: { id: userCart.id },
          data: { couponCode: guestCart.couponCode },
        })
      }
      await tx.cart.delete({ where: { id: guestCart.id } })
    }

    const guestWishlist = await tx.wishlist.findUnique({
      where: { guestTokenHash },
      include: { items: true },
    })
    if (guestWishlist) {
      const userWishlist =
        (await tx.wishlist.findUnique({ where: { userId } })) ??
        (await tx.wishlist.create({ data: { userId } }))
      for (const item of guestWishlist.items) {
        await tx.wishlistItem.upsert({
          where: {
            wishlistId_productId: { wishlistId: userWishlist.id, productId: item.productId },
          },
          create: {
            wishlistId: userWishlist.id,
            productId: item.productId,
            variantId: item.variantId,
          },
          update: {},
        })
        mergedWishlist++
      }
      await tx.wishlist.delete({ where: { id: guestWishlist.id } })
    }
    return { mergedItems, mergedWishlist }
  })
}

/** Route-handler helper: merge (if a guest cookie exists) and clear the guest cookie. */
export async function mergeGuestState(
  req: NextRequest,
  response: NextResponse,
  userId: string,
): Promise<void> {
  const guestTokenHash = readGuestTokenHash(req)
  if (!guestTokenHash) return
  try {
    const result = await mergeGuestIntoUser(guestTokenHash, userId)
    logger.debug('cart.guest_merged', { userId, ...result })
  } catch (error) {
    // Signing in must not fail because of a cart problem; the guest data stays until it expires.
    logger.error('cart.guest_merge_failed', { userId, error })
    return
  }
  clearGuestCookie(response)
}
