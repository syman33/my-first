import 'server-only'
import { prisma } from '@/db/client'
import { checkPasswordPolicy, hashPassword } from '@/lib/auth/password'
import { DEV_ACCOUNT_DOMAIN } from '@/lib/startup-checks'
import { emailField, nameField } from '@/schemas/common'
import { recordAudit, SYSTEM_ACTOR } from '@/services/audit/audit.service'
import { invalidateUserSessions } from '@/services/auth/session.service'

/**
 * Operator provisioning (used by `npm run admin:create`): create the first
 * real administrator, or reset an existing account to an active administrator
 * with a new password, and retire the development seed accounts.
 */

/** Administrators get a longer minimum than customers. */
export const ADMIN_MIN_PASSWORD_LENGTH = 12

export class ProvisioningError extends Error {
  override name = 'ProvisioningError'
}

export function adminPasswordProblem(password: string, email: string): string | null {
  if (password.length < ADMIN_MIN_PASSWORD_LENGTH) {
    return `Use at least ${ADMIN_MIN_PASSWORD_LENGTH} characters for an administrator password.`
  }
  const problem = checkPasswordPolicy(password, { email })
  if (problem === 'passwordTooCommon') return 'This password is too common. Choose another.'
  if (problem === 'passwordTooLong') return 'This password is too long.'
  return null
}

export async function provisionAdministrator(input: {
  email: string
  name: string
  password: string
  /** Allow taking over an existing account (role → ADMIN, status → ACTIVE, new password). */
  reset: boolean
  productionLike: boolean
}): Promise<{ userId: string; outcome: 'created' | 'reset' }> {
  const email = emailField.safeParse(input.email)
  if (!email.success) throw new ProvisioningError('Enter a valid email address.')
  const name = nameField.safeParse(input.name)
  if (!name.success) throw new ProvisioningError('Enter a name of 2–120 characters.')
  if (input.productionLike && email.data.endsWith(`@${DEV_ACCOUNT_DOMAIN}`)) {
    throw new ProvisioningError(`@${DEV_ACCOUNT_DOMAIN} addresses are for development only.`)
  }
  const problem = adminPasswordProblem(input.password, email.data)
  if (problem) throw new ProvisioningError(problem)
  const passwordHash = await hashPassword(input.password)

  return prisma.$transaction(async (tx) => {
    if (!(await tx.role.findUnique({ where: { key: 'ADMIN' }, select: { key: true } }))) {
      throw new ProvisioningError(
        'Roles are not set up in this database yet. Load the reference data first: SEED_PROFILE=reference npm run db:seed',
      )
    }
    const existing = await tx.user.findUnique({
      where: { email: email.data },
      select: { id: true },
    })
    if (existing && !input.reset) {
      throw new ProvisioningError(
        'An account with this email already exists. Re-run with --reset to make it an active administrator with the new password.',
      )
    }
    if (existing) {
      await tx.user.update({
        where: { id: existing.id },
        data: {
          name: name.data,
          role: 'ADMIN',
          status: 'ACTIVE',
          passwordHash,
          passwordChangedAt: new Date(),
        },
      })
      await invalidateUserSessions(existing.id, {}, tx)
      await recordAudit(
        tx,
        { actor: SYSTEM_ACTOR },
        {
          action: 'admin.reset_by_operator',
          entityType: 'user',
          entityId: existing.id,
          metadata: { via: 'cli' },
        },
      )
      return { userId: existing.id, outcome: 'reset' as const }
    }
    const created = await tx.user.create({
      data: {
        email: email.data,
        name: name.data,
        role: 'ADMIN',
        passwordHash,
        passwordChangedAt: new Date(),
      },
      select: { id: true },
    })
    await recordAudit(
      tx,
      { actor: SYSTEM_ACTOR },
      {
        action: 'admin.created_by_operator',
        entityType: 'user',
        entityId: created.id,
        metadata: { via: 'cli' },
      },
    )
    return { userId: created.id, outcome: 'created' as const }
  })
}

/** Suspend every development seed account (@velora.local) and end their sessions. */
export async function suspendDevelopmentAccounts(): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const accounts = await tx.user.findMany({
      where: { email: { endsWith: `@${DEV_ACCOUNT_DOMAIN}` }, status: 'ACTIVE' },
      select: { id: true },
    })
    for (const account of accounts) {
      await tx.user.update({ where: { id: account.id }, data: { status: 'SUSPENDED' } })
      await invalidateUserSessions(account.id, {}, tx)
      await recordAudit(
        tx,
        { actor: SYSTEM_ACTOR },
        {
          action: 'user.dev_account_suspended',
          entityType: 'user',
          entityId: account.id,
          metadata: { via: 'cli' },
        },
      )
    }
    return accounts.length
  })
}
