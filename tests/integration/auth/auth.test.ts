import { beforeEach, describe, expect, it } from 'vitest'
import { POST as forgotPassword } from '@/app/api/auth/forgot-password/route'
import { POST as login } from '@/app/api/auth/login/route'
import { POST as logout } from '@/app/api/auth/logout/route'
import { POST as register } from '@/app/api/auth/register/route'
import { POST as resetPassword } from '@/app/api/auth/reset-password/route'
import { GET as session } from '@/app/api/auth/session/route'
import { POST as verifyEmail } from '@/app/api/auth/verify-email/route'
import { POST as changePassword } from '@/app/api/account/password/route'
import { prisma } from '@/db/client'
import { hashPassword } from '@/lib/auth/password'
import { hashToken, unsealSecret } from '@/lib/security/tokens'
import { processPendingEvents } from '@/services/events/process'
import { createUser, ensureRoles } from '../helpers/factories'
import { type ApiError, TestClient } from '../helpers/http'

const PASSWORD = 'Desert-Rose-2026'

async function registered(client = new TestClient(), email = 'layla@example.test') {
  const res = await client.call(register, {
    body: { name: 'Layla Ahmed', email, password: PASSWORD, locale: 'en', acceptTerms: true },
  })
  expect(res.status).toBe(201)
  return client
}

async function customerWithPassword(
  email: string,
  status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE',
  role: 'CUSTOMER' | 'ADMIN' = 'CUSTOMER',
) {
  return createUser({ email, passwordHash: await hashPassword(PASSWORD), status, role })
}

async function tokenFromOutbox(
  type: 'PASSWORD_RESET_REQUESTED' | 'EMAIL_VERIFICATION_REQUESTED',
): Promise<string> {
  const event = await prisma.outboxEvent.findFirstOrThrow({
    where: { type },
    orderBy: { createdAt: 'desc' },
  })
  const payload = event.payload as Record<string, string>
  const sealed =
    type === 'PASSWORD_RESET_REQUESTED' ? payload.sealedResetUrl! : payload.sealedVerifyUrl!
  const url = new URL(unsealSecret(sealed))
  // Tokens travel in the fragment, never the query string (kept out of server logs and Referer).
  expect(url.search).toBe('')
  return new URLSearchParams(url.hash.slice(1)).get('token')!
}

beforeEach(async () => {
  await ensureRoles()
})

describe('registration', () => {
  it('creates a customer, signs them in and never stores the password in plaintext', async () => {
    const client = await registered()
    const me = await client.call<{ data: { user: { email: string; role: string } } }>(session)
    expect(me.body.data.user).toMatchObject({ email: 'layla@example.test', role: 'CUSTOMER' })
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'layla@example.test' } })
    expect(user.passwordHash).toMatch(/^\$argon2id\$/)
    expect(user.passwordHash).not.toContain(PASSWORD)
  })

  it('rejects duplicate emails case-insensitively (409)', async () => {
    await registered()
    const res = await new TestClient().call<ApiError>(register, {
      body: {
        name: 'Other',
        email: 'LAYLA@example.test',
        password: PASSWORD,
        locale: 'ar',
        acceptTerms: true,
      },
    })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('EMAIL_ALREADY_REGISTERED')
    expect(res.body.error.message).toBe(
      'هذا البريد الإلكتروني مسجّل مسبقاً. سجّل الدخول أو استعد كلمة المرور.',
    )
  })

  it('validates input with localised field errors (422)', async () => {
    const res = await new TestClient().call<ApiError>(register, {
      body: {
        name: 'L',
        email: 'not-an-email',
        password: 'short',
        locale: 'en',
        acceptTerms: false,
      },
      headers: { 'x-velora-locale': 'en' },
    })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.fieldErrors).toMatchObject({
      name: 'This is too short.',
      email: 'Enter a valid email address.',
      password: 'Password must be at least 8 characters.',
      acceptTerms: 'You must agree to continue.',
    })
  })

  it('blocks common passwords', async () => {
    const res = await new TestClient().call<ApiError>(register, {
      body: {
        name: 'Layla',
        email: 'x@example.test',
        password: 'password123',
        locale: 'en',
        acceptTerms: true,
      },
      headers: { 'x-velora-locale': 'en' },
    })
    expect(res.status).toBe(422)
    expect(res.body.error.fieldErrors?.password).toMatch(/too common/)
  })

  it('rejects malformed JSON and non-JSON bodies', async () => {
    const client = new TestClient()
    expect((await client.call<ApiError>(register, { rawBody: '{"name":' })).status).toBe(400)
    const res = await client.call<ApiError>(register, {
      rawBody: 'name=x',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    expect(res.status).toBe(415)
  })

  it('queues welcome and verification emails that are delivered exactly once', async () => {
    await registered()
    await processPendingEvents()
    await processPendingEvents() // replay: must not duplicate
    const notifications = await prisma.notification.findMany({ orderBy: { template: 'asc' } })
    expect(notifications.map((n) => n.template)).toEqual(['verify-email', 'welcome'])
    // Console provider in tests: recorded honestly as not delivered.
    expect(notifications.every((n) => n.status === 'SKIPPED')).toBe(true)
    // Sealed secrets are purged from processed events.
    const verify = await prisma.outboxEvent.findFirstOrThrow({
      where: { type: 'EMAIL_VERIFICATION_REQUESTED' },
    })
    expect((verify.payload as Record<string, string>).sealedVerifyUrl).toBe('[purged]')
  })
})

describe('login & sessions', () => {
  it('signs in with valid credentials and stores only a hash of the session token', async () => {
    await customerWithPassword('noura@example.test')
    const client = new TestClient()
    const res = await client.call(login, {
      body: { email: 'Noura@Example.test', password: PASSWORD },
    })
    expect(res.status).toBe(200)
    const cookie = res.setCookies.find((c) => c.startsWith('velora_session='))!
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=lax/i)
    expect(cookie).toMatch(/Path=\//)
    const token = client.cookies.get('velora_session')!
    const stored = await prisma.session.findFirstOrThrow()
    expect(stored.id).toBe(hashToken(token))
    expect(stored.id).not.toBe(token)
  })

  it('returns the same error for unknown emails and wrong passwords', async () => {
    await customerWithPassword('noura@example.test')
    const wrong = await new TestClient().call<ApiError>(login, {
      body: { email: 'noura@example.test', password: 'Wrong-Password-1' },
    })
    const unknown = await new TestClient().call<ApiError>(login, {
      body: { email: 'nobody@example.test', password: 'Wrong-Password-1' },
    })
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS')
    expect(unknown.body.error).toEqual(wrong.body.error)
  })

  it('refuses suspended accounts', async () => {
    await customerWithPassword('suspended@example.test', 'SUSPENDED')
    const res = await new TestClient().call<ApiError>(login, {
      body: { email: 'suspended@example.test', password: PASSWORD },
    })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED')
  })

  it('rate-limits repeated attempts against one account (429 + Retry-After)', async () => {
    await customerWithPassword('target@example.test')
    let last: Awaited<ReturnType<TestClient['call']>> | undefined
    for (let i = 0; i < 9; i++) {
      last = await new TestClient().call<ApiError>(login, {
        body: { email: 'target@example.test', password: `Wrong-${i}-xyz` },
      })
    }
    expect(last?.status).toBe(429)
    expect(Number(last?.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('rotates the session on login (session fixation defence)', async () => {
    await customerWithPassword('noura@example.test')
    const client = new TestClient()
    await client.call(login, { body: { email: 'noura@example.test', password: PASSWORD } })
    const first = client.cookies.get('velora_session')!
    await client.call(login, { body: { email: 'noura@example.test', password: PASSWORD } })
    const second = client.cookies.get('velora_session')!
    expect(second).not.toBe(first)
    expect(await prisma.session.count({ where: { id: hashToken(first) } })).toBe(0)
  })

  it('logs out by revoking the server-side session', async () => {
    await customerWithPassword('noura@example.test')
    const client = new TestClient()
    await client.call(login, { body: { email: 'noura@example.test', password: PASSWORD } })
    const token = client.cookies.get('velora_session')!
    const res = await client.call(logout, { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await prisma.session.count()).toBe(0)
    // Replaying the old cookie no longer works.
    const replay = new TestClient()
    replay.setCookie('velora_session', token)
    const me = await replay.call<{ data: { user: null } }>(session)
    expect(me.body.data.user).toBeNull()
  })

  it('treats expired sessions as anonymous and deletes them', async () => {
    await customerWithPassword('noura@example.test')
    const client = new TestClient()
    await client.call(login, { body: { email: 'noura@example.test', password: PASSWORD } })
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    const me = await client.call<{ data: { user: null } }>(session)
    expect(me.body.data.user).toBeNull()
    expect(await prisma.session.count()).toBe(0)
  })

  it('ends sessions of users who get suspended', async () => {
    const user = await customerWithPassword('noura@example.test')
    const client = new TestClient()
    await client.call(login, { body: { email: 'noura@example.test', password: PASSWORD } })
    await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } })
    const me = await client.call<{ data: { user: null } }>(session)
    expect(me.body.data.user).toBeNull()
  })

  it('rejects state-changing requests without a same-site Origin (CSRF)', async () => {
    await customerWithPassword('noura@example.test')
    const crossSite = await new TestClient().call<ApiError>(login, {
      body: { email: 'noura@example.test', password: PASSWORD },
      origin: 'https://evil.example',
    })
    expect(crossSite.status).toBe(403)
    expect(crossSite.body.error.code).toBe('CSRF_REJECTED')
    const noOrigin = await new TestClient().call<ApiError>(login, {
      body: { email: 'noura@example.test', password: PASSWORD },
      noOrigin: true,
    })
    expect(noOrigin.status).toBe(403)
  })

  it('blocks development accounts in production-like environments', async () => {
    await customerWithPassword('admin@velora.local', 'ACTIVE', 'ADMIN')
    const previous = process.env.APP_ENV
    process.env.APP_ENV = 'staging'
    try {
      const res = await new TestClient().call<ApiError>(login, {
        body: { email: 'admin@velora.local', password: PASSWORD },
      })
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('ACCOUNT_DISABLED')
    } finally {
      process.env.APP_ENV = previous
    }
  })
})

describe('password reset', () => {
  it('responds identically for known and unknown emails', async () => {
    await customerWithPassword('noura@example.test')
    const known = await new TestClient().call(forgotPassword, {
      body: { email: 'noura@example.test', locale: 'ar' },
    })
    const unknown = await new TestClient().call(forgotPassword, {
      body: { email: 'ghost@example.test', locale: 'ar' },
    })
    expect(known.status).toBe(200)
    expect(unknown.status).toBe(200)
    expect(known.body).toEqual(unknown.body)
    expect(await prisma.verificationToken.count({ where: { purpose: 'PASSWORD_RESET' } })).toBe(1)
  })

  it('resets the password once, signs out every session and invalidates the token', async () => {
    await customerWithPassword('noura@example.test')
    const signedIn = new TestClient()
    await signedIn.call(login, { body: { email: 'noura@example.test', password: PASSWORD } })

    await new TestClient().call(forgotPassword, {
      body: { email: 'noura@example.test', locale: 'en' },
    })
    const token = await tokenFromOutbox('PASSWORD_RESET_REQUESTED')
    const res = await new TestClient().call(resetPassword, {
      body: { token, password: 'New-Desert-Rose-2027' },
    })
    expect(res.status).toBe(200)

    expect(await prisma.session.count()).toBe(0)
    const reuse = await new TestClient().call<ApiError>(resetPassword, {
      body: { token, password: 'Another-Pass-2028' },
    })
    expect(reuse.status).toBe(400)
    expect(reuse.body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN')

    const old = await new TestClient().call(login, {
      body: { email: 'noura@example.test', password: PASSWORD },
    })
    expect(old.status).toBe(401)
    const fresh = await new TestClient().call(login, {
      body: { email: 'noura@example.test', password: 'New-Desert-Rose-2027' },
    })
    expect(fresh.status).toBe(200)
  })

  it('rejects expired tokens and only honours the newest link', async () => {
    await customerWithPassword('noura@example.test')
    await new TestClient().call(forgotPassword, {
      body: { email: 'noura@example.test', locale: 'en' },
    })
    const firstToken = await tokenFromOutbox('PASSWORD_RESET_REQUESTED')
    await new TestClient().call(forgotPassword, {
      body: { email: 'noura@example.test', locale: 'en' },
    })
    const secondToken = await tokenFromOutbox('PASSWORD_RESET_REQUESTED')
    expect(
      (
        await new TestClient().call(resetPassword, {
          body: { token: firstToken, password: 'New-Desert-Rose-2027' },
        })
      ).status,
    ).toBe(400)

    await prisma.verificationToken.updateMany({
      where: { tokenHash: hashToken(secondToken) },
      data: { expiresAt: new Date(Date.now() - 1) },
    })
    expect(
      (
        await new TestClient().call(resetPassword, {
          body: { token: secondToken, password: 'New-Desert-Rose-2027' },
        })
      ).status,
    ).toBe(400)
  })
})

describe('email verification', () => {
  it('verifies the address with the emailed token', async () => {
    await registered()
    const token = await tokenFromOutbox('EMAIL_VERIFICATION_REQUESTED')
    const res = await new TestClient().call(verifyEmail, { body: { token } })
    expect(res.status).toBe(200)
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'layla@example.test' } })
    expect(user.emailVerifiedAt).not.toBeNull()
    expect((await new TestClient().call(verifyEmail, { body: { token } })).status).toBe(400)
  })
})

describe('change password', () => {
  it('requires the current password and signs out other devices only', async () => {
    await customerWithPassword('noura@example.test')
    const phone = new TestClient()
    const laptop = new TestClient()
    await phone.call(login, { body: { email: 'noura@example.test', password: PASSWORD } })
    await laptop.call(login, { body: { email: 'noura@example.test', password: PASSWORD } })

    const wrong = await laptop.call<ApiError>(changePassword, {
      body: { currentPassword: 'nope-nope-nope', newPassword: 'New-Desert-Rose-2027' },
    })
    expect(wrong.status).toBe(422)
    expect(wrong.body.error.code).toBe('CURRENT_PASSWORD_INCORRECT')

    const res = await laptop.call(changePassword, {
      body: { currentPassword: PASSWORD, newPassword: 'New-Desert-Rose-2027' },
    })
    expect(res.status).toBe(200)
    expect((await laptop.call<{ data: { user: unknown } }>(session)).body.data.user).not.toBeNull()
    expect((await phone.call<{ data: { user: unknown } }>(session)).body.data.user).toBeNull()
  })

  it('is unavailable without a session (401)', async () => {
    const res = await new TestClient().call<ApiError>(changePassword, {
      body: { currentPassword: 'x', newPassword: 'New-Desert-Rose-2027' },
    })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })
})
