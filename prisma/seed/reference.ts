import type { PrismaClient } from '../../src/generated/prisma/client'
import { type Permission } from '../../src/generated/prisma/enums'
import { defaultSettings, SETTINGS_GROUPS } from '../../src/schemas/settings'
import { categories } from './data/catalog'
import { faqItems, pages } from './data/content'

/**
 * Reference data required by every environment (including production):
 * roles, default settings, the category tree and CMS pages.
 *
 * Idempotent and non-destructive: rows are created only when missing, so
 * re-running never overwrites changes an administrator has made.
 */

const ALL_PERMISSIONS: Permission[] = [
  'DASHBOARD_VIEW',
  'ORDERS_VIEW',
  'ORDERS_MANAGE',
  'ORDERS_REFUND',
  'PRODUCTS_VIEW',
  'PRODUCTS_MANAGE',
  'PRODUCTS_DELETE',
  'CATALOG_MANAGE',
  'INVENTORY_VIEW',
  'INVENTORY_ADJUST',
  'CUSTOMERS_VIEW',
  'CUSTOMERS_MANAGE',
  'COUPONS_MANAGE',
  'REVIEWS_MODERATE',
  'CONTENT_MANAGE',
  'NEWSLETTER_VIEW',
  'MESSAGES_VIEW',
  'SETTINGS_MANAGE',
  'ADMIN_USERS_MANAGE',
  'AUDIT_LOG_VIEW',
  'IMPORT_EXPORT',
  'NOTIFICATIONS_VIEW',
]

/** Default staff capabilities: day-to-day operations, no money movement or system administration. */
export const DEFAULT_STAFF_PERMISSIONS: Permission[] = [
  'DASHBOARD_VIEW',
  'ORDERS_VIEW',
  'ORDERS_MANAGE',
  'PRODUCTS_VIEW',
  'INVENTORY_VIEW',
  'INVENTORY_ADJUST',
  'CUSTOMERS_VIEW',
  'REVIEWS_MODERATE',
  'MESSAGES_VIEW',
  'NEWSLETTER_VIEW',
  'NOTIFICATIONS_VIEW',
]

export async function seedReference(prisma: PrismaClient): Promise<void> {
  // Roles
  const roles = [
    { key: 'CUSTOMER' as const, nameAr: 'عميل', nameEn: 'Customer', permissions: [] as Permission[] },
    { key: 'STAFF' as const, nameAr: 'موظف', nameEn: 'Staff', permissions: DEFAULT_STAFF_PERMISSIONS },
    { key: 'ADMIN' as const, nameAr: 'مدير', nameEn: 'Administrator', permissions: ALL_PERMISSIONS },
  ]
  for (const role of roles) {
    await prisma.role.upsert({ where: { key: role.key }, create: role, update: {} })
  }

  // Settings: one validated document per group, defaults only when missing.
  for (const group of SETTINGS_GROUPS) {
    await prisma.setting.upsert({
      where: { key: group },
      create: { key: group, value: defaultSettings(group) as object },
      update: {},
    })
  }

  // Categories (parents first).
  const ordered = [...categories].sort((a, b) => Number(Boolean(a.parent)) - Number(Boolean(b.parent)))
  for (const category of ordered) {
    const parent = category.parent ? await prisma.category.findUnique({ where: { slug: category.parent } }) : null
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: {
        slug: category.slug,
        nameAr: category.nameAr,
        nameEn: category.nameEn,
        descriptionAr: category.descriptionAr,
        descriptionEn: category.descriptionEn,
        kind: category.kind,
        gender: category.gender ?? null,
        parentId: parent?.id ?? null,
        sortOrder: category.sortOrder,
        showInNav: category.showInNav,
        imageUrl: `/images/categories/${category.slug}.webp`,
      },
      update: {},
    })
  }
  // Collections without dedicated artwork reuse related imagery.
  const imageFallbacks: Record<string, string> = {
    'new-arrivals': '/images/editorial/promo-new.webp',
    'best-sellers': '/images/categories/bags.webp',
    offers: '/images/editorial/promo-offers.webp',
  }
  for (const [slug, imageUrl] of Object.entries(imageFallbacks)) {
    await prisma.category.updateMany({ where: { slug, imageUrl: `/images/categories/${slug}.webp` }, data: { imageUrl } })
  }

  // CMS pages.
  for (const page of pages) {
    await prisma.page.upsert({
      where: { slug: page.slug },
      create: {
        slug: page.slug,
        titleAr: page.titleAr,
        titleEn: page.titleEn,
        contentAr: page.contentAr,
        contentEn: page.contentEn,
        seoDescriptionAr: page.seoDescriptionAr,
        seoDescriptionEn: page.seoDescriptionEn,
        isPublished: true,
      },
      update: {},
    })
  }

  if ((await prisma.faqItem.count()) === 0) {
    await prisma.faqItem.createMany({ data: faqItems.map((item, index) => ({ ...item, sortOrder: index })) })
  }
}
