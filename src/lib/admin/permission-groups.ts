import type { Permission } from '@/generated/prisma/enums'

/**
 * How permissions are presented in the role editor, and which "view"
 * permission each action needs (a staff member who may refund orders must be
 * able to open them). Pure, shared by the editor and the server.
 */

export const PERMISSION_GROUPS: ReadonlyArray<{
  key: 'overview' | 'sales' | 'catalog' | 'marketing' | 'content' | 'system'
  permissions: readonly Permission[]
}> = [
  { key: 'overview', permissions: ['DASHBOARD_VIEW'] },
  {
    key: 'sales',
    permissions: [
      'ORDERS_VIEW',
      'ORDERS_MANAGE',
      'ORDERS_REFUND',
      'CUSTOMERS_VIEW',
      'CUSTOMERS_MANAGE',
    ],
  },
  {
    key: 'catalog',
    permissions: [
      'PRODUCTS_VIEW',
      'PRODUCTS_MANAGE',
      'PRODUCTS_DELETE',
      'CATALOG_MANAGE',
      'INVENTORY_VIEW',
      'INVENTORY_ADJUST',
    ],
  },
  { key: 'marketing', permissions: ['COUPONS_MANAGE', 'NEWSLETTER_VIEW'] },
  { key: 'content', permissions: ['CONTENT_MANAGE', 'REVIEWS_MODERATE', 'MESSAGES_VIEW'] },
  {
    key: 'system',
    permissions: [
      'SETTINGS_MANAGE',
      'ADMIN_USERS_MANAGE',
      'AUDIT_LOG_VIEW',
      'IMPORT_EXPORT',
      'NOTIFICATIONS_VIEW',
    ],
  },
]

export const PERMISSION_REQUIRES: Partial<Record<Permission, readonly Permission[]>> = {
  ORDERS_MANAGE: ['ORDERS_VIEW'],
  ORDERS_REFUND: ['ORDERS_VIEW'],
  CUSTOMERS_MANAGE: ['CUSTOMERS_VIEW'],
  PRODUCTS_MANAGE: ['PRODUCTS_VIEW'],
  PRODUCTS_DELETE: ['PRODUCTS_VIEW'],
  INVENTORY_ADJUST: ['INVENTORY_VIEW'],
}

/** Add the view permissions that granted actions depend on. */
export function withRequiredPermissions(permissions: readonly Permission[]): Permission[] {
  const out = new Set(permissions)
  for (const permission of permissions) {
    for (const required of PERMISSION_REQUIRES[permission] ?? []) out.add(required)
  }
  return [...out]
}

/** Permissions that must be removed together with `permission` (the actions that depend on it). */
export function dependentPermissions(permission: Permission): Permission[] {
  return (Object.entries(PERMISSION_REQUIRES) as [Permission, readonly Permission[]][])
    .filter(([, required]) => required.includes(permission))
    .map(([dependent]) => dependent)
}
