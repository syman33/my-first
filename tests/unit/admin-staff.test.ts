import { describe, expect, it } from 'vitest'
import { getDictionary } from '@/i18n'
import {
  dependentPermissions,
  PERMISSION_GROUPS,
  PERMISSION_REQUIRES,
  withRequiredPermissions,
} from '@/lib/admin/permission-groups'
import {
  ADMIN_ONLY_PERMISSIONS,
  ALL_PERMISSIONS,
  effectivePermissions,
  hasPermission,
} from '@/lib/auth/permissions'
import { inviteStaffSchema, staffPermissionsSchema, updateStaffSchema } from '@/schemas/admin-staff'

describe('administrator-only permissions', () => {
  it('are never effective for staff, even when stored on the role', () => {
    const stored = ['ORDERS_VIEW', 'ADMIN_USERS_MANAGE'] as const
    expect(effectivePermissions('STAFF', stored)).toEqual(['ORDERS_VIEW'])
    const staff = { id: 's', role: 'STAFF' as const, permissions: stored }
    expect(hasPermission(staff, 'ADMIN_USERS_MANAGE')).toBe(false)
    expect(hasPermission(staff, 'ORDERS_VIEW')).toBe(true)
    const admin = { id: 'a', role: 'ADMIN' as const, permissions: [] }
    expect(hasPermission(admin, 'ADMIN_USERS_MANAGE')).toBe(true)
    expect(effectivePermissions('ADMIN', [])).toEqual(ALL_PERMISSIONS)
  })
})

describe('role editor groups', () => {
  it('list every permission exactly once', () => {
    const listed = PERMISSION_GROUPS.flatMap((group) => group.permissions)
    expect([...listed].sort()).toEqual([...ALL_PERMISSIONS].sort())
    expect(new Set(listed).size).toBe(listed.length)
  })

  it('have a label in both languages for every permission and group', () => {
    for (const locale of ['ar', 'en'] as const) {
      const dict = getDictionary(locale)
      for (const permission of ALL_PERMISSIONS) {
        expect(dict.admin.staff.permissions.labels[permission], permission).toBeTruthy()
      }
      for (const group of PERMISSION_GROUPS) {
        expect(dict.admin.nav.groups[group.key], group.key).toBeTruthy()
      }
    }
  })

  it('grants the view an action needs, and removes actions with their view', () => {
    expect(withRequiredPermissions(['ORDERS_REFUND']).sort()).toEqual([
      'ORDERS_REFUND',
      'ORDERS_VIEW',
    ])
    expect(dependentPermissions('ORDERS_VIEW').sort()).toEqual(['ORDERS_MANAGE', 'ORDERS_REFUND'])
    expect(dependentPermissions('DASHBOARD_VIEW')).toEqual([])
    // Requirements never point at administrator-only permissions.
    for (const required of Object.values(PERMISSION_REQUIRES).flat()) {
      expect(ADMIN_ONLY_PERMISSIONS).not.toContain(required)
    }
  })
})

describe('staff schemas', () => {
  it('normalise invitations and require a change on updates', () => {
    expect(
      inviteStaffSchema.parse({
        name: '  Sara Alqahtani ',
        email: ' Sara@Velora.SA ',
        role: 'STAFF',
        locale: 'ar',
      }),
    ).toEqual({ name: 'Sara Alqahtani', email: 'sara@velora.sa', role: 'STAFF', locale: 'ar' })
    expect(
      inviteStaffSchema.safeParse({ name: 'X Y', email: 'x@y.sa', role: 'CUSTOMER', locale: 'ar' })
        .success,
    ).toBe(false)
    expect(updateStaffSchema.safeParse({}).success).toBe(false)
    expect(updateStaffSchema.parse({ status: 'SUSPENDED' })).toEqual({ status: 'SUSPENDED' })
    expect(staffPermissionsSchema.safeParse({ permissions: ['ORDERS_VIEW', 'ROOT'] }).success).toBe(
      false,
    )
  })
})
