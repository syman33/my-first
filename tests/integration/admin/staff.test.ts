import type { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { POST as login } from '@/app/api/auth/login/route'
import { POST as resetPassword } from '@/app/api/auth/reset-password/route'
import { PUT as permissionsRoute } from '@/app/api/admin/roles/staff/route'
import { POST as passwordLinkRoute } from '@/app/api/admin/staff/[id]/password-link/route'
import { PATCH as updateRoute } from '@/app/api/admin/staff/[id]/route'
import { POST as inviteRoute } from '@/app/api/admin/staff/route'
import { prisma } from '@/db/client'
import { unsealSecret } from '@/lib/security/tokens'
import {
  provisionAdministrator,
  ProvisioningError,
  suspendDevelopmentAccounts,
} from '@/services/admin/provision.service'
import { signedInStaff } from '../helpers/checkout'
import { createUser, ensureRoles } from '../helpers/factories'
import { TestClient } from '../helpers/http'

type Body = {
  data?: Record<string, unknown>
  error?: { code: string; fieldErrors?: Record<string, string>; details?: Record<string, unknown> }
}
type IdRoute = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>

const patch = (client: TestClient, id: string, body: unknown) =>
  client.call<Body, { id: string }>(updateRoute as IdRoute, {
    method: 'PATCH',
    params: { id },
    body,
  })

const invitation = {
  name: 'Sara Alqahtani',
  email: 'sara@example.test',
  role: 'STAFF',
  locale: 'en',
}

async function setupToken(userId: string): Promise<string> {
  const event = await prisma.outboxEvent.findFirstOrThrow({
    where: { type: 'STAFF_INVITED', aggregateId: userId },
    orderBy: { createdAt: 'desc' },
  })
  const url = new URL(unsealSecret((event.payload as Record<string, string>).sealedSetupUrl!))
  expect(url.search).toBe('')
  return new URLSearchParams(url.hash.slice(1)).get('token')!
}

describe('team management', () => {
  it('invites a member who then chooses their own password', async () => {
    const admin = await signedInStaff('team-admin@example.test', 'ADMIN')
    const invited = await admin.client.call<Body>(inviteRoute, { body: invitation })
    expect(invited.status).toBe(201)
    const member = await prisma.user.findUniqueOrThrow({ where: { email: 'sara@example.test' } })
    expect(member).toMatchObject({ role: 'STAFF', status: 'ACTIVE', locale: 'en' })

    // The link is sealed in the outbox and valid for 72 hours.
    const token = await setupToken(member.id)
    const stored = await prisma.verificationToken.findFirstOrThrow({
      where: { userId: member.id, usedAt: null },
    })
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(71 * 3_600_000)
    const event = await prisma.outboxEvent.findFirstOrThrow({ where: { type: 'STAFF_INVITED' } })
    expect(JSON.stringify(event.payload)).not.toContain(token)

    const chosen = await new TestClient().call(resetPassword, {
      body: { token, password: 'Saffron-Lantern-2026' },
    })
    expect(chosen.status).toBe(200)
    const signIn = await new TestClient().call(login, {
      body: { email: 'sara@example.test', password: 'Saffron-Lantern-2026' },
    })
    expect(signIn.status).toBe(200)

    const duplicate = await admin.client.call<Body>(inviteRoute, { body: invitation })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.error?.fieldErrors).toHaveProperty('email')
    expect(
      await prisma.auditLog.count({ where: { action: 'staff.invited', entityId: member.id } }),
    ).toBe(1)
  })

  it('never lets staff manage the team, even if the role was given the permission', async () => {
    const staff = await signedInStaff('team-staff@example.test')
    await prisma.role.update({
      where: { key: 'STAFF' },
      data: { permissions: { push: 'ADMIN_USERS_MANAGE' } },
    })
    const invite = await staff.client.call<Body>(inviteRoute, {
      body: { ...invitation, role: 'ADMIN' },
    })
    expect(invite.status).toBe(403)
    const promote = await patch(staff.client, staff.user.id, { role: 'ADMIN' })
    expect(promote.status).toBe(403)
    expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(0)
  })

  it('changes roles and suspends accounts, ending their sessions, but never the actor’s own', async () => {
    const admin = await signedInStaff('team-owner@example.test', 'ADMIN')
    const other = await signedInStaff('team-member@example.test')

    const self = await patch(admin.client, admin.user.id, { status: 'SUSPENDED' })
    expect(self.status).toBe(409)
    expect(self.body.error?.details).toMatchObject({ reason: 'SELF' })

    expect((await patch(admin.client, other.user.id, { role: 'ADMIN' })).status).toBe(200)
    expect(await prisma.session.count({ where: { userId: other.user.id } })).toBe(0)

    // The promoted admin signs in again and could act — until suspended.
    const again = new TestClient()
    expect(
      (
        await again.call(login, {
          body: { email: 'team-member@example.test', password: 'Desert-Rose-2026' },
        })
      ).status,
    ).toBe(200)
    expect((await patch(admin.client, other.user.id, { status: 'SUSPENDED' })).status).toBe(200)
    expect(await prisma.session.count({ where: { userId: other.user.id } })).toBe(0)
    const afterSuspension = await patch(again, admin.user.id, { role: 'STAFF' })
    expect(afterSuspension.status).toBe(401)

    const customer = await createUser({ email: 'shopper@example.test' })
    expect((await patch(admin.client, customer.id, { role: 'ADMIN' })).status).toBe(404)
    expect(
      (
        await prisma.auditLog.findMany({
          where: { action: 'staff.updated', entityId: other.user.id },
        })
      ).length,
    ).toBe(2)
  })

  it('sends a fresh invitation while pending, then ordinary reset links', async () => {
    const admin = await signedInStaff('team-links@example.test', 'ADMIN')
    const invited = await admin.client.call<Body>(inviteRoute, { body: invitation })
    const memberId = (invited.body.data?.user as { id: string }).id
    const call = () =>
      admin.client.call<Body, { id: string }>(passwordLinkRoute as IdRoute, {
        params: { id: memberId },
        body: {},
      })

    expect((await call()).body.data).toEqual({ kind: 'invitation' })
    expect(await prisma.outboxEvent.count({ where: { type: 'STAFF_INVITED' } })).toBe(2)
    // Only the newest link works.
    expect(
      await prisma.verificationToken.count({ where: { userId: memberId, usedAt: null } }),
    ).toBe(1)

    await prisma.user.update({ where: { id: memberId }, data: { lastLoginAt: new Date() } })
    expect((await call()).body.data).toEqual({ kind: 'reset' })
    expect(await prisma.outboxEvent.count({ where: { type: 'PASSWORD_RESET_REQUESTED' } })).toBe(1)
  })

  it('edits staff permissions, adding the views that actions need', async () => {
    const admin = await signedInStaff('team-roles@example.test', 'ADMIN')
    const saved = await admin.client.call<Body>(permissionsRoute, {
      method: 'PUT',
      body: { permissions: ['ORDERS_REFUND', 'COUPONS_MANAGE'] },
    })
    expect(saved.status).toBe(200)
    expect(saved.body.data?.permissions).toEqual(['ORDERS_VIEW', 'ORDERS_REFUND', 'COUPONS_MANAGE'])
    expect(await prisma.role.findUniqueOrThrow({ where: { key: 'STAFF' } })).toMatchObject({
      permissions: ['ORDERS_VIEW', 'ORDERS_REFUND', 'COUPONS_MANAGE'],
    })

    const escalate = await admin.client.call<Body>(permissionsRoute, {
      method: 'PUT',
      body: { permissions: ['ORDERS_VIEW', 'ADMIN_USERS_MANAGE'] },
    })
    expect(escalate.status).toBe(422)
    expect(escalate.body.error?.fieldErrors).toHaveProperty('permissions')
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'role.permissions_updated' },
    })
    expect(audit.metadata).toMatchObject({ added: ['ORDERS_REFUND', 'COUPONS_MANAGE'] })
  })
})

describe('operator provisioning (npm run admin:create)', () => {
  const owner = { email: 'owner@example.test', name: 'Store Owner', productionLike: true }

  it('explains that reference data must be loaded first on an empty database', async () => {
    await expect(
      provisionAdministrator({ ...owner, password: 'Amber-Courtyard-Lantern', reset: false }),
    ).rejects.toThrow(/SEED_PROFILE=reference npm run db:seed/)
    expect(await prisma.user.count()).toBe(0)
  })

  it('creates an administrator with a strong password and refuses weak ones', async () => {
    await ensureRoles()
    await expect(
      provisionAdministrator({ ...owner, password: 'short-pass', reset: false }),
    ).rejects.toBeInstanceOf(ProvisioningError)
    const created = await provisionAdministrator({
      ...owner,
      password: 'Amber-Courtyard-Lantern',
      reset: false,
    })
    expect(created.outcome).toBe('created')
    expect(await prisma.user.findUniqueOrThrow({ where: { id: created.userId } })).toMatchObject({
      role: 'ADMIN',
      status: 'ACTIVE',
    })
    expect(
      (
        await new TestClient().call(login, {
          body: { email: owner.email, password: 'Amber-Courtyard-Lantern' },
        })
      ).status,
    ).toBe(200)
  })

  it('takes over an existing account only with --reset, and never a development address in production', async () => {
    await createUser({ email: owner.email, status: 'SUSPENDED' })
    await expect(
      provisionAdministrator({ ...owner, password: 'Amber-Courtyard-Lantern', reset: false }),
    ).rejects.toThrow(/--reset/)
    const reset = await provisionAdministrator({
      ...owner,
      password: 'Amber-Courtyard-Lantern',
      reset: true,
    })
    expect(reset.outcome).toBe('reset')
    expect(await prisma.user.findUniqueOrThrow({ where: { email: owner.email } })).toMatchObject({
      role: 'ADMIN',
      status: 'ACTIVE',
    })
    await expect(
      provisionAdministrator({
        ...owner,
        email: 'admin@velora.local',
        password: 'Amber-Courtyard-Lantern',
        reset: false,
      }),
    ).rejects.toThrow(/development/)
  })

  it('suspends the development seed accounts', async () => {
    await createUser({ email: 'admin@velora.local', role: 'ADMIN' })
    await createUser({ email: 'staff@velora.local', role: 'STAFF' })
    await createUser({ email: 'real@example.test' })
    expect(await suspendDevelopmentAccounts()).toBe(2)
    expect(await prisma.user.count({ where: { status: 'SUSPENDED' } })).toBe(2)
  })
})
