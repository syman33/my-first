import 'server-only'
import { prisma, type DbClient } from '@/db/client'
import { isUniqueViolation } from '@/db/errors'
import type { Permission } from '@/generated/prisma/enums'
import type { Locale } from '@/i18n/config'
import { hashPassword } from '@/lib/auth/password'
import { withRequiredPermissions } from '@/lib/admin/permission-groups'
import { ALL_PERMISSIONS, isGrantableToStaff } from '@/lib/auth/permissions'
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors'
import { generateToken, hashToken, sealSecret } from '@/lib/security/tokens'
import { absoluteUrl } from '@/lib/seo'
import type { InviteStaffInput, UpdateStaffInput } from '@/schemas/admin-staff'
import { type AuditContext, diffFields, recordAudit } from '@/services/audit/audit.service'
import { requestPasswordReset } from '@/services/auth/auth.service'
import { invalidateUserSessions } from '@/services/auth/session.service'
import { enqueueEvent } from '@/services/events/outbox.service'
import { addHours } from '@/utils/time'

/**
 * Back-office accounts. Only administrators manage them (ADMIN_USERS_MANAGE is
 * never effective for STAFF). Safeguards: the acting administrator must still
 * be active (checked under lock) and can never change their own role or
 * status — so an active administrator always remains, even when two admins
 * act at once. Suspension ends every session, and new staff choose their own
 * password from an emailed link.
 */

const INVITE_TTL_HOURS = 72

export interface StaffActor {
  id: string
  name: string
}

export async function listStaff() {
  return prisma.user.findMany({
    where: { role: { in: ['STAFF', 'ADMIN'] } },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      locale: true,
      lastLoginAt: true,
      passwordChangedAt: true,
      createdAt: true,
    },
  })
}

export async function getStaffRolePermissions(): Promise<Permission[]> {
  const role = await prisma.role.findUnique({
    where: { key: 'STAFF' },
    select: { permissions: true },
  })
  return role?.permissions ?? []
}

/** An invited account that has never signed in or set a password. */
export function isInvitationPending(user: {
  lastLoginAt: Date | null
  passwordChangedAt: Date | null
}): boolean {
  return user.lastLoginAt === null && user.passwordChangedAt === null
}

function toLocale(value: string): Locale {
  return value === 'en' ? 'en' : 'ar'
}

/** A single-use link to choose a password (only the newest link works). */
async function issueSetupLink(
  tx: DbClient,
  user: { id: string; locale: Locale },
  invitedByName: string,
): Promise<void> {
  const token = generateToken()
  await tx.verificationToken.updateMany({
    where: { userId: user.id, purpose: 'PASSWORD_RESET', usedAt: null },
    data: { usedAt: new Date() },
  })
  await tx.verificationToken.create({
    data: {
      userId: user.id,
      purpose: 'PASSWORD_RESET',
      tokenHash: hashToken(token),
      expiresAt: addHours(new Date(), INVITE_TTL_HOURS),
    },
  })
  await enqueueEvent(tx, {
    type: 'STAFF_INVITED',
    aggregateType: 'user',
    aggregateId: user.id,
    payload: {
      userId: user.id,
      locale: user.locale,
      invitedByName,
      sealedSetupUrl: sealSecret(absoluteUrl(`/${user.locale}/reset-password#token=${token}`)),
    },
  })
}

export async function inviteStaff(
  input: InviteStaffInput,
  audit: AuditContext,
  actor: StaffActor,
): Promise<{ id: string }> {
  // Unusable until the invitee chooses a password: nobody, including the inviter, knows it.
  const placeholderHash = await hashPassword(generateToken())
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          role: input.role,
          locale: input.locale,
          passwordHash: placeholderHash,
        },
        select: { id: true },
      })
      await issueSetupLink(tx, { id: user.id, locale: input.locale }, actor.name)
      await recordAudit(tx, audit, {
        action: 'staff.invited',
        entityType: 'user',
        entityId: user.id,
        metadata: { role: input.role },
      })
      return user
    })
  } catch (error) {
    if (isUniqueViolation(error, 'email')) {
      throw new AppError('CONFLICT', 'Email already registered', {
        status: 409,
        fieldErrors: { email: 'emailTaken' },
      })
    }
    throw error
  }
}

export async function updateStaffMember(
  userId: string,
  input: UpdateStaffInput,
  audit: AuditContext,
  actor: StaffActor,
): Promise<void> {
  if (userId === actor.id) {
    throw new AppError('CONFLICT', 'You cannot change your own role or status', {
      status: 409,
      details: { reason: 'SELF' },
    })
  }
  await prisma.$transaction(async (tx) => {
    // Lock the active administrators: if two admins demote each other at the
    // same moment, the second sees that its actor is no longer one and stops.
    const admins = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' ORDER BY id FOR UPDATE`
    if (!admins.some((admin) => admin.id === actor.id)) {
      throw new ForbiddenError('Only active administrators can manage staff')
    }
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    })
    if (!target || target.role === 'CUSTOMER') throw new NotFoundError()
    const next = { role: input.role ?? target.role, status: input.status ?? target.status }
    if (next.role === target.role && next.status === target.status) return
    await tx.user.update({ where: { id: userId }, data: next })
    // A new role or a suspension starts from a clean slate: every session ends.
    await invalidateUserSessions(userId, {}, tx)
    await recordAudit(tx, audit, {
      action: 'staff.updated',
      entityType: 'user',
      entityId: userId,
      metadata: {
        changes: diffFields({ role: target.role, status: target.status }, next),
      },
    })
  })
}

/**
 * Email a staff member a way back in: a fresh invitation while they have
 * never signed in, otherwise the standard password-reset link.
 */
export async function sendStaffPasswordLink(
  userId: string,
  audit: AuditContext,
  actor: StaffActor,
): Promise<{ kind: 'invitation' | 'reset' }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      locale: true,
      lastLoginAt: true,
      passwordChangedAt: true,
    },
  })
  if (!user || user.role === 'CUSTOMER') throw new NotFoundError()
  if (user.status !== 'ACTIVE') {
    throw new AppError('CONFLICT', 'Suspended accounts cannot receive sign-in links', {
      status: 409,
      details: { reason: 'SUSPENDED' },
    })
  }
  const locale = toLocale(user.locale)
  const kind = isInvitationPending(user) ? 'invitation' : 'reset'
  if (kind === 'invitation') {
    await prisma.$transaction(async (tx) => {
      await issueSetupLink(tx, { id: user.id, locale }, actor.name)
      await recordAudit(tx, audit, {
        action: 'staff.invitation_resent',
        entityType: 'user',
        entityId: user.id,
      })
    })
  } else {
    await requestPasswordReset(user.email, locale)
    await recordAudit(prisma, audit, {
      action: 'staff.password_reset_sent',
      entityType: 'user',
      entityId: user.id,
    })
  }
  return { kind }
}

/**
 * Replace the STAFF role's permissions. Administrator-only permissions are
 * refused; view permissions that granted actions depend on are added.
 */
export async function updateStaffPermissions(
  permissions: Permission[],
  audit: AuditContext,
): Promise<Permission[]> {
  if (permissions.some((permission) => !isGrantableToStaff(permission))) {
    throw new ValidationError({ permissions: 'permissionNotGrantable' })
  }
  // Actions bring the view they need (refunding orders requires seeing them).
  const requested = new Set(withRequiredPermissions(permissions))
  // Stable order (the enum's), so the stored list and the audit diff are predictable.
  const next = ALL_PERMISSIONS.filter((permission) => requested.has(permission))
  return prisma.$transaction(async (tx) => {
    const role = await tx.role.findUnique({
      where: { key: 'STAFF' },
      select: { permissions: true },
    })
    if (!role) throw new NotFoundError()
    const before = new Set(role.permissions)
    await tx.role.update({ where: { key: 'STAFF' }, data: { permissions: next } })
    await recordAudit(tx, audit, {
      action: 'role.permissions_updated',
      entityType: 'role',
      entityId: 'STAFF',
      metadata: {
        added: next.filter((permission) => !before.has(permission)),
        removed: role.permissions.filter((permission) => !requested.has(permission)),
      },
    })
    return next
  })
}
