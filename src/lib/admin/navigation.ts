import type { Permission } from '@/generated/prisma/enums'
import { hasPermission, type Principal } from '@/lib/auth/permissions'

/**
 * Back-office navigation. Each entry names the permission that its page
 * enforces server-side; the menu only hides what the user could not open
 * anyway (UI visibility is never the security boundary).
 */

export type AdminNavKey =
  | 'dashboard'
  | 'orders'
  | 'returns'
  | 'customers'
  | 'products'
  | 'categories'
  | 'brands'
  | 'inventory'
  | 'coupons'
  | 'banners'
  | 'newsletter'
  | 'reviews'
  | 'pages'
  | 'faq'
  | 'messages'
  | 'settings'
  | 'staff'
  | 'audit'
  | 'notifications'
  | 'importExport'

export type AdminNavGroupKey = 'overview' | 'sales' | 'catalog' | 'marketing' | 'content' | 'system'

export interface AdminNavItem {
  key: AdminNavKey
  href: string
  permission: Permission
}

export const ADMIN_NAV: readonly { group: AdminNavGroupKey; items: readonly AdminNavItem[] }[] = [
  {
    group: 'overview',
    items: [{ key: 'dashboard', href: '/admin', permission: 'DASHBOARD_VIEW' }],
  },
  {
    group: 'sales',
    items: [
      { key: 'orders', href: '/admin/orders', permission: 'ORDERS_VIEW' },
      { key: 'returns', href: '/admin/returns', permission: 'ORDERS_VIEW' },
      { key: 'customers', href: '/admin/customers', permission: 'CUSTOMERS_VIEW' },
    ],
  },
  {
    group: 'catalog',
    items: [
      { key: 'products', href: '/admin/products', permission: 'PRODUCTS_VIEW' },
      { key: 'categories', href: '/admin/categories', permission: 'CATALOG_MANAGE' },
      { key: 'brands', href: '/admin/brands', permission: 'CATALOG_MANAGE' },
      { key: 'inventory', href: '/admin/inventory', permission: 'INVENTORY_VIEW' },
    ],
  },
  {
    group: 'marketing',
    items: [
      { key: 'coupons', href: '/admin/coupons', permission: 'COUPONS_MANAGE' },
      { key: 'banners', href: '/admin/banners', permission: 'CONTENT_MANAGE' },
      { key: 'newsletter', href: '/admin/newsletter', permission: 'NEWSLETTER_VIEW' },
    ],
  },
  {
    group: 'content',
    items: [
      { key: 'reviews', href: '/admin/reviews', permission: 'REVIEWS_MODERATE' },
      { key: 'pages', href: '/admin/pages', permission: 'CONTENT_MANAGE' },
      { key: 'faq', href: '/admin/faq', permission: 'CONTENT_MANAGE' },
      { key: 'messages', href: '/admin/messages', permission: 'MESSAGES_VIEW' },
    ],
  },
  {
    group: 'system',
    items: [
      { key: 'settings', href: '/admin/settings', permission: 'SETTINGS_MANAGE' },
      { key: 'staff', href: '/admin/staff', permission: 'ADMIN_USERS_MANAGE' },
      { key: 'audit', href: '/admin/audit', permission: 'AUDIT_LOG_VIEW' },
      { key: 'notifications', href: '/admin/notifications', permission: 'NOTIFICATIONS_VIEW' },
      { key: 'importExport', href: '/admin/import-export', permission: 'IMPORT_EXPORT' },
    ],
  },
]

/** The menu as this principal may see it (empty groups removed). */
export function visibleAdminNav(principal: Principal) {
  return ADMIN_NAV.map((group) => ({
    group: group.group,
    items: group.items.filter((item) => hasPermission(principal, item.permission)),
  })).filter((group) => group.items.length > 0)
}

/** The nav entry a pathname belongs to (longest matching prefix). */
export function activeAdminNavKey(pathname: string): AdminNavKey | null {
  let best: AdminNavItem | null = null
  for (const group of ADMIN_NAV) {
    for (const item of group.items) {
      const matches =
        item.href === '/admin'
          ? pathname === '/admin'
          : pathname === item.href || pathname.startsWith(`${item.href}/`)
      if (matches && (!best || item.href.length > best.href.length)) best = item
    }
  }
  return best?.key ?? null
}
