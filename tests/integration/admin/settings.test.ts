import type { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { PUT as settingsRoute } from '@/app/api/admin/settings/[group]/route'
import { prisma } from '@/db/client'
import { defaultSettings } from '@/schemas/settings'
import { getSettings } from '@/services/settings/settings.service'
import { placeOrder, readyToCheckout, signedInStaff } from '../helpers/checkout'
import type { TestClient } from '../helpers/http'

type Body = {
  data?: { settings?: Record<string, unknown> }
  error?: { code: string; fieldErrors?: Record<string, string> }
}
type Route = (req: NextRequest, ctx: { params: Promise<{ group: string }> }) => Promise<Response>

const put = (client: TestClient, group: string, body: unknown) =>
  client.call<Body, { group: string }>(settingsRoute as Route, {
    method: 'PUT',
    params: { group },
    body,
  })

describe('admin settings', () => {
  it('saves a group in full, audits the change and applies it immediately', async () => {
    const admin = await signedInStaff('settings-admin@example.test', 'ADMIN')
    const staff = await signedInStaff('settings-staff@example.test')
    const shipping = {
      ...defaultSettings('shipping'),
      standardFee: 1_950,
      freeShippingThreshold: null,
    }

    expect((await put(staff.client, 'shipping', shipping)).status).toBe(403)
    expect((await put(admin.client, 'secrets', shipping)).status).toBe(404)

    const saved = await put(admin.client, 'shipping', shipping)
    expect(saved.status).toBe(200)
    expect(await getSettings('shipping')).toMatchObject({
      standardFee: 1_950,
      freeShippingThreshold: null,
    })
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'settings.updated', entityId: 'shipping' },
    })
    expect(audit.actorId).toBe(admin.user.id)
    expect(audit.metadata).toMatchObject({
      changes: { standardFee: { from: 2_500, to: 1_950 } },
    })
  })

  it('rejects invalid values with field errors and keeps the stored settings', async () => {
    const admin = await signedInStaff('settings-validate@example.test', 'ADMIN')
    const backwards = await put(admin.client, 'shipping', {
      ...defaultSettings('shipping'),
      standardDaysMin: 6,
      standardDaysMax: 3,
    })
    expect(backwards.status).toBe(422)
    expect(backwards.body.error?.fieldErrors).toHaveProperty('standardDaysMax')

    const store = await put(admin.client, 'store', {
      ...defaultSettings('store'),
      vatNumber: '123456789012345',
      social: { instagram: 'javascript:alert(1)' },
    })
    expect(store.status).toBe(422)
    expect(Object.keys(store.body.error?.fieldErrors ?? {}).sort()).toEqual([
      'social.instagram',
      'vatNumber',
    ])
    expect(await prisma.setting.count()).toBe(0)
  })

  it('requires a confirmed email at checkout once the store asks for it', async () => {
    const admin = await signedInStaff('settings-checkout@example.test', 'ADMIN')
    expect(
      (
        await put(admin.client, 'checkout', {
          ...defaultSettings('checkout'),
          requireEmailVerification: true,
        })
      ).status,
    ).toBe(200)

    const shopper = await readyToCheckout('unverified@example.test')
    const refused = await placeOrder(shopper.client, shopper.address.id)
    expect(refused.status).toBe(403)
    expect(refused.body.error?.code).toBe('EMAIL_NOT_VERIFIED')
    expect(await prisma.order.count()).toBe(0)

    await prisma.user.update({
      where: { id: shopper.user.id },
      data: { emailVerifiedAt: new Date() },
    })
    expect((await placeOrder(shopper.client, shopper.address.id)).status).toBe(200)
  })

  it('falls back to defaults for a stored value that no longer validates', async () => {
    await prisma.setting.create({
      data: { key: 'cod', value: { enabled: false, fee: -100, minOrder: 1_000 } },
    })
    expect(await getSettings('cod')).toEqual({
      ...defaultSettings('cod'),
      enabled: false,
      minOrder: 1_000,
    })
  })
})
