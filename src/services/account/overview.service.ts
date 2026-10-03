import 'server-only'
import { prisma } from '@/db/client'

/** Data for the account overview page, scoped to one customer. */
export async function getAccountOverview(userId: string) {
  const [user, recentOrders, defaultAddress] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { createdAt: true } }),
    prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        total: true,
        createdAt: true,
        items: { select: { quantity: true } },
      },
    }),
    prisma.address.findFirst({
      where: { userId, isDefault: true },
      select: {
        fullName: true,
        phone: true,
        city: true,
        district: true,
        street: true,
        buildingNumber: true,
        postalCode: true,
        additionalNumber: true,
      },
    }),
  ])
  return {
    memberSince: user.createdAt,
    recentOrders: recentOrders.map(({ items, ...order }) => ({
      ...order,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    })),
    defaultAddress,
  }
}
