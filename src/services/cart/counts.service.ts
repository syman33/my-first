import 'server-only'
import { cache } from 'react'
import { prisma } from '@/db/client'
import { getCurrentSession, getGuestTokenHash } from '@/lib/auth/current-user'

/** Header badge counts for the current shopper (signed-in user or guest). */
export const getShopperCounts = cache(async (): Promise<{ cart: number; wishlist: number }> => {
  const session = await getCurrentSession()
  const guestTokenHash = session ? null : await getGuestTokenHash()
  if (!session && !guestTokenHash) return { cart: 0, wishlist: 0 }
  const owner = session ? { userId: session.user.id } : { guestTokenHash: guestTokenHash! }
  const [cart, wishlist] = await Promise.all([
    prisma.cartItem.aggregate({ where: { cart: owner }, _sum: { quantity: true } }),
    prisma.wishlistItem.count({ where: { wishlist: owner } }),
  ])
  return { cart: cart._sum.quantity ?? 0, wishlist }
})
