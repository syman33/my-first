import * as z from 'zod'
import { Permission } from '@/generated/prisma/enums'
import { emailField, nameField } from '@/schemas/common'

/** Back-office accounts and the STAFF role's permissions. */

export const STAFF_ROLES = ['STAFF', 'ADMIN'] as const

export const inviteStaffSchema = z.object({
  name: nameField,
  email: emailField,
  role: z.enum(STAFF_ROLES),
  /** Language of the invitation email. */
  locale: z.enum(['ar', 'en']),
})
export type InviteStaffInput = z.output<typeof inviteStaffSchema>

export const updateStaffSchema = z
  .object({
    role: z.enum(STAFF_ROLES).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  })
  .refine((value) => value.role !== undefined || value.status !== undefined, {
    error: 'required',
  })
export type UpdateStaffInput = z.output<typeof updateStaffSchema>

export const staffPermissionsSchema = z.object({
  permissions: z.array(z.enum(Permission)).max(64),
})
