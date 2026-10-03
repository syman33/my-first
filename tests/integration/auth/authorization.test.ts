import { beforeEach, describe, expect, it } from 'vitest'
import {
  GET as addressGet,
  DELETE as addressDelete,
  PATCH as addressPatch,
} from '@/app/api/account/addresses/[id]/route'
import { GET as addressList, POST as addressCreate } from '@/app/api/account/addresses/route'
import { POST as setDefault } from '@/app/api/account/addresses/[id]/default/route'
import { POST as login } from '@/app/api/auth/login/route'
import { prisma } from '@/db/client'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { hashPassword } from '@/lib/auth/password'
import { createUser, ensureRoles } from '../helpers/factories'
import { type ApiError, TestClient } from '../helpers/http'

const PASSWORD = 'Desert-Rose-2026'

async function signedIn(email: string, role: 'CUSTOMER' | 'STAFF' | 'ADMIN' = 'CUSTOMER') {
  const user = await createUser({ email, role, passwordHash: await hashPassword(PASSWORD) })
  const client = new TestClient()
  const res = await client.call(login, { body: { email, password: PASSWORD } })
  expect(res.status).toBe(200)
  return { user, client }
}

const addressBody = {
  label: 'Home',
  fullName: 'Noura Alotaibi',
  phone: '٠٥٠٠٠٠٠١٠١',
  city: 'الرياض',
  district: 'حي الملقا',
  street: 'طريق أنس بن مالك',
  buildingNumber: '٨١٢٣',
  postalCode: '13521',
}

// Synthetic back-office endpoints exercising the same wrapper every admin route uses.
const staffOnly = apiHandler({ auth: 'staff' }, async (ctx) => ok({ role: ctx.user.role }))
const settingsOnly = apiHandler({ auth: 'staff', permission: 'SETTINGS_MANAGE' }, async () =>
  ok({ allowed: true }),
)
const ordersOnly = apiHandler({ auth: 'staff', permission: 'ORDERS_VIEW' }, async () =>
  ok({ allowed: true }),
)

beforeEach(async () => {
  await ensureRoles()
})

describe('role-based access control', () => {
  it('Anonymous → back office = 401', async () => {
    const res = await new TestClient().call<ApiError>(staffOnly)
    expect(res.status).toBe(401)
  })

  it('Customer → back office = 403', async () => {
    const { client } = await signedIn('customer@example.test')
    expect((await client.call<ApiError>(staffOnly)).status).toBe(403)
    expect((await client.call<ApiError>(ordersOnly)).status).toBe(403)
  })

  it('Staff → permitted action = 200, restricted action = 403', async () => {
    const { client } = await signedIn('staff@example.test', 'STAFF')
    expect((await client.call(ordersOnly)).status).toBe(200)
    const denied = await client.call<ApiError>(settingsOnly)
    expect(denied.status).toBe(403)
    expect(denied.body.error.code).toBe('FORBIDDEN')
  })

  it('Staff permissions follow the role definition server-side', async () => {
    const { client } = await signedIn('staff@example.test', 'STAFF')
    await prisma.role.update({ where: { key: 'STAFF' }, data: { permissions: ['DASHBOARD_VIEW'] } })
    expect((await client.call<ApiError>(ordersOnly)).status).toBe(403)
  })

  it('Admin → every permission, regardless of the stored role definition', async () => {
    await prisma.role.update({ where: { key: 'ADMIN' }, data: { permissions: [] } })
    const { client } = await signedIn('admin@example.test', 'ADMIN')
    expect((await client.call(settingsOnly)).status).toBe(200)
    expect((await client.call(ordersOnly)).status).toBe(200)
  })

  it('a demoted user loses access on the next request', async () => {
    const { user, client } = await signedIn('admin2@example.test', 'ADMIN')
    expect((await client.call(settingsOnly)).status).toBe(200)
    await prisma.user.update({ where: { id: user.id }, data: { role: 'CUSTOMER' } })
    expect((await client.call<ApiError>(settingsOnly)).status).toBe(403)
  })
})

describe('address book isolation (IDOR)', () => {
  it('normalises Saudi phone numbers and Arabic digits', async () => {
    const { client } = await signedIn('noura@example.test')
    const res = await client.call<{
      data: { address: { phone: string; buildingNumber: string; isDefault: boolean } }
    }>(addressCreate, {
      body: addressBody,
    })
    expect(res.status).toBe(201)
    expect(res.body.data.address).toMatchObject({
      phone: '+966500000101',
      buildingNumber: '8123',
      isDefault: true,
    })
  })

  it('validates the national address format', async () => {
    const { client } = await signedIn('noura@example.test')
    const res = await client.call<ApiError>(addressCreate, {
      body: { ...addressBody, buildingNumber: '12', postalCode: 'abcde', phone: '123' },
      headers: { 'x-velora-locale': 'en' },
    })
    expect(res.status).toBe(422)
    expect(res.body.error.fieldErrors).toMatchObject({
      buildingNumber: 'Building number must be 4 digits.',
      postalCode: 'Postal code must be 5 digits.',
      phone: 'Enter a valid Saudi mobile number, e.g. 05XXXXXXXX.',
    })
  })

  it('Customer A cannot read, change, delete or default Customer B’s address', async () => {
    const a = await signedIn('a@example.test')
    const b = await signedIn('b@example.test')
    const created = await b.client.call<{ data: { address: { id: string } } }>(addressCreate, {
      body: addressBody,
    })
    const id = created.body.data.address.id

    for (const [handler, options] of [
      [addressGet, { params: { id } }],
      [addressPatch, { method: 'PATCH', params: { id }, body: { ...addressBody, city: 'جدة' } }],
      [addressDelete, { method: 'DELETE', params: { id } }],
      [setDefault, { method: 'POST', params: { id } }],
    ] as const) {
      const res = await a.client.call<ApiError, { id: string }>(handler as never, options as never)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('ADDRESS_NOT_FOUND')
    }
    const list = await a.client.call<{ data: { addresses: unknown[] } }>(addressList)
    expect(list.body.data.addresses).toHaveLength(0)
    const untouched = await prisma.address.findUniqueOrThrow({ where: { id } })
    expect(untouched.city).toBe('الرياض')
  })

  it('Anonymous → private account data = 401', async () => {
    expect((await new TestClient().call<ApiError>(addressList)).status).toBe(401)
  })

  it('keeps exactly one default address', async () => {
    const { client } = await signedIn('noura@example.test')
    const first = await client.call<{ data: { address: { id: string } } }>(addressCreate, {
      body: addressBody,
    })
    const second = await client.call<{ data: { address: { id: string } } }>(addressCreate, {
      body: { ...addressBody, label: 'Work', isDefault: true },
    })
    let rows = await prisma.address.findMany({ where: { isDefault: true } })
    expect(rows.map((r) => r.id)).toEqual([second.body.data.address.id])
    await client.call(addressDelete, {
      method: 'DELETE',
      params: { id: second.body.data.address.id },
    })
    rows = await prisma.address.findMany({ where: { isDefault: true } })
    expect(rows.map((r) => r.id)).toEqual([first.body.data.address.id])
  })

  it('returns 404 for malformed ids without touching the database layer', async () => {
    const { client } = await signedIn('noura@example.test')
    const res = await client.call<ApiError, { id: string }>(addressGet, {
      params: { id: "1' OR '1'='1" },
    })
    expect(res.status).toBe(404)
  })
})
