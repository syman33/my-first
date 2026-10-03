import { describe, expect, it } from 'vitest'
import { POST as contact } from '@/app/api/contact/route'
import { POST as subscribe } from '@/app/api/newsletter/route'
import { POST as unsubscribe } from '@/app/api/newsletter/unsubscribe/route'
import { prisma } from '@/db/client'
import { unsealSecret } from '@/lib/security/tokens'
import { type ApiError, TestClient } from '../helpers/http'

async function latestUnsubscribeToken(): Promise<string> {
  const event = await prisma.outboxEvent.findFirstOrThrow({
    where: { type: 'NEWSLETTER_SUBSCRIBED' },
    orderBy: { createdAt: 'desc' },
  })
  const url = new URL(
    unsealSecret((event.payload as { sealedUnsubscribeUrl: string }).sealedUnsubscribeUrl),
  )
  expect(url.search).toBe('')
  return new URLSearchParams(url.hash.slice(1)).get('token')!
}

describe('newsletter', () => {
  it('subscribes once, answers identically for repeats and never stores duplicates', async () => {
    const client = new TestClient()
    const first = await client.call(subscribe, {
      body: { email: 'Reem@Example.test', locale: 'ar' },
    })
    const again = await client.call(subscribe, {
      body: { email: 'reem@example.test', locale: 'en' },
    })
    expect(first.status).toBe(200)
    expect(again.status).toBe(200)
    expect(again.body).toEqual(first.body)
    expect(await prisma.newsletterSubscriber.count()).toBe(1)
    expect(await prisma.outboxEvent.count({ where: { type: 'NEWSLETTER_SUBSCRIBED' } })).toBe(1)
  })

  it('unsubscribes with the emailed token and can re-subscribe later', async () => {
    const client = new TestClient()
    await client.call(subscribe, { body: { email: 'nour@example.test', locale: 'ar' } })
    const token = await latestUnsubscribeToken()

    expect((await client.call(unsubscribe, { body: { token } })).status).toBe(200)
    expect((await client.call(unsubscribe, { body: { token } })).status).toBe(200)
    expect(await prisma.newsletterSubscriber.findFirstOrThrow()).toMatchObject({
      status: 'UNSUBSCRIBED',
    })

    await client.call(subscribe, { body: { email: 'nour@example.test', locale: 'ar' } })
    expect(await prisma.newsletterSubscriber.findFirstOrThrow()).toMatchObject({
      status: 'SUBSCRIBED',
      unsubscribedAt: null,
    })
    // The old link stops working once a new one is issued.
    expect((await client.call<ApiError>(unsubscribe, { body: { token } })).status).toBe(400)
  })

  it('rejects unknown tokens and invalid emails', async () => {
    const client = new TestClient()
    const bad = await client.call<ApiError>(unsubscribe, { body: { token: 'x'.repeat(43) } })
    expect(bad.status).toBe(400)
    expect(bad.body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN')
    const invalid = await client.call<ApiError>(subscribe, { body: { email: 'not-an-email' } })
    expect(invalid.status).toBe(422)
    expect(invalid.body.error.fieldErrors?.email).toBeTruthy()
  })

  it('limits repeated welcome emails to one address', async () => {
    const client = new TestClient()
    const statuses: number[] = []
    for (let i = 0; i < 4; i++) {
      statuses.push((await client.call(subscribe, { body: { email: 'loop@example.test' } })).status)
    }
    expect(statuses).toEqual([200, 200, 200, 429])
  })
})

describe('contact form', () => {
  const valid = {
    name: 'Fahad Alqahtani',
    email: 'fahad@example.test',
    phone: '0551234567',
    subject: 'Order question',
    message: 'When will my order arrive in Jeddah?',
    locale: 'en',
  }

  it('stores the message and queues a notification for customer care', async () => {
    const res = await new TestClient().call<{ data: { id: string } }>(contact, { body: valid })
    expect(res.status).toBe(201)
    const stored = await prisma.contactMessage.findUniqueOrThrow({
      where: { id: res.body.data.id },
    })
    expect(stored).toMatchObject({
      email: 'fahad@example.test',
      phone: '+966551234567',
      status: 'NEW',
    })
    expect(await prisma.outboxEvent.count({ where: { type: 'CONTACT_MESSAGE_RECEIVED' } })).toBe(1)
  })

  it('validates on the server with localised field errors', async () => {
    const res = await new TestClient().call<ApiError>(contact, {
      body: { ...valid, email: 'nope', message: 'short', locale: 'ar' },
      headers: { 'x-velora-locale': 'ar' },
    })
    expect(res.status).toBe(422)
    expect(Object.keys(res.body.error.fieldErrors ?? {}).sort()).toEqual(['email', 'message'])
    expect(await prisma.contactMessage.count()).toBe(0)
  })

  it('is rate limited per client', async () => {
    const client = new TestClient()
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) statuses.push((await client.call(contact, { body: valid })).status)
    expect(statuses.slice(0, 5).every((s) => s === 201)).toBe(true)
    expect(statuses[5]).toBe(429)
  })
})
