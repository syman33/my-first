import { Permission, type RoleKey } from '@/generated/prisma/enums'

/**
 * Role-based access control.
 *
 * - CUSTOMER: storefront only, no back-office permissions.
 * - STAFF: exactly the permissions granted to the STAFF role (editable by admins).
 * - ADMIN: every permission, always (hardcoded so an admin can never lock
 *   everyone out by editing roles).
 *
 * Authorization is always evaluated server-side; UI visibility is cosmetic.
 */

export const ALL_PERMISSIONS = Object.values(Permission) as Permission[]

/**
 * Never effective for the STAFF role, even if stored on it: whoever manages
 * staff accounts and role permissions could otherwise promote themselves.
 */
export const ADMIN_ONLY_PERMISSIONS: readonly Permission[] = ['ADMIN_USERS_MANAGE']

export function isGrantableToStaff(permission: Permission): boolean {
  return !ADMIN_ONLY_PERMISSIONS.includes(permission)
}

export interface Principal {
  id: string
  role: RoleKey
  permissions: readonly Permission[]
}

export function isBackOfficeRole(role: RoleKey): boolean {
  return role === 'STAFF' || role === 'ADMIN'
}

export function hasPermission(
  principal: Principal | null | undefined,
  permission: Permission,
): boolean {
  if (!principal) return false
  if (principal.role === 'ADMIN') return true
  if (principal.role === 'STAFF')
    return isGrantableToStaff(permission) && principal.permissions.includes(permission)
  return false
}

export function effectivePermissions(
  role: RoleKey,
  rolePermissions: readonly Permission[],
): Permission[] {
  if (role === 'ADMIN') return [...ALL_PERMISSIONS]
  if (role === 'STAFF') return [...new Set(rolePermissions)].filter(isGrantableToStaff)
  return []
}

export type { Permission, RoleKey }
