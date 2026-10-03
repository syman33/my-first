import 'server-only'
import { cache } from 'react'
import { prisma } from '@/db/client'

export interface NavCategory {
  id: string
  slug: string
  nameAr: string
  nameEn: string
}

/** Categories flagged for the main navigation, in merchandising order. */
export const getNavigationCategories = cache(async (): Promise<NavCategory[]> => {
  return prisma.category.findMany({
    where: { isActive: true, showInNav: true },
    select: { id: true, slug: true, nameAr: true, nameEn: true },
    orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
  })
})

/** Footer "Shop" links: top-level taxonomy + gender collections. */
export const getFooterCategories = cache(async (): Promise<NavCategory[]> => {
  return prisma.category.findMany({
    where: { isActive: true, parentId: null, kind: { in: ['STANDARD', 'GENDER'] } },
    select: { id: true, slug: true, nameAr: true, nameEn: true },
    orderBy: [{ sortOrder: 'asc' }],
    take: 8,
  })
})
