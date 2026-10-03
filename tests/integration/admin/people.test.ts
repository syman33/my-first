import type { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { GET as sessionRoute } from '@/app/api/auth/session/route'
import { POST as customerStatusRoute } from '@/app/api/admin/customers/[id]/status/route'
import { POST as moderateRoute } from '@/app/api/admin/reviews/[id]/moderate/route'
import { GET as exportRoute } from '@/app/api/admin/newsletter/export/route'
import { POST as reviewRoute } from '@/app/api/products/[id]/reviews/route'
import { prisma } from '@/db/client'
import { getMessage, setMessageStatus } from '@/services/admin/customers.service'
import { reviewEligibility } from '@/services/reviews/review.service'
import type { TestClient } from '../helpers/http'
import { deliveredOrder, signedInCustomer, signedInStaff } from '../helpers/checkout'
import { createProduct } from '../helpers/factories'

type Body = {
  data?: Record<string, unknown>
  error?: { code: string; details?: Record<string, unknown> }
}
type IdRoute = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
const post = (client: TestClient, route: IdRoute, id: string, body: unknown) =>
  client.call<Body, { id: string }>(route, { body, params: { id } })

const review = {
  rating: 4,
  title: 'Beautiful finish',
  body: 'The leather is soft and the stitching is neat.',
}

describe('reviews', () => {
  it('lets only customers with a delivered order review, once, and keeps the rating to approved reviews', async () => {
    const buyer = await deliveredOrder('reviewer@example.test')
    const stranger = await signedInCustomer('no-purchase@example.test')
    expect(await reviewEligibility(null, buyer.product.id)).toEqual({
      canReview: false,
      reason: 'SIGN_IN',
    })
    const refused = await post(stranger.client, reviewRoute, buyer.product.id, review)
    expect(refused.status).toBe(403)
    expect(refused.body.error?.details).toMatchObject({ reason: 'NOT_PURCHASED' })

    const submitted = await post(buyer.client, reviewRoute, buyer.product.id, review)
    expect(submitted.status).toBe(201)
    expect(submitted.body.data).toMatchObject({ review: { status: 'PENDING' } })
    const twice = await post(buyer.client, reviewRoute, buyer.product.id, review)
    expect(twice.status).toBe(409)

    // Pending reviews never count.
    expect(
      await prisma.product.findUniqueOrThrow({ where: { id: buyer.product.id } }),
    ).toMatchObject({ ratingCount: 0, ratingAverage: 0 })

    const moderator = await signedInStaff('moderator@example.test')
    const stored = await prisma.review.findFirstOrThrow({ where: { productId: buyer.product.id } })
    expect(stored).toMatchObject({ isVerifiedPurchase: true, orderItemId: expect.any(String) })
    expect(
      (await post(moderator.client, moderateRoute, stored.id, { decision: 'APPROVED' })).status,
    ).toBe(200)
    expect(
      await prisma.product.findUniqueOrThrow({ where: { id: buyer.product.id } }),
    ).toMatchObject({ ratingCount: 1, ratingAverage: 400 })

    const noReason = await post(moderator.client, moderateRoute, stored.id, {
      decision: 'REJECTED',
    })
    expect(noReason.status).toBe(422)
    expect(
      (
        await post(moderator.client, moderateRoute, stored.id, {
          decision: 'REJECTED',
          reason: 'Mentions a competitor',
        })
      ).status,
    ).toBe(200)
    expect(
      await prisma.product.findUniqueOrThrow({ where: { id: buyer.product.id } }),
    ).toMatchObject({ ratingCount: 0, ratingAverage: 0 })
  })

  it('publishes straight away when auto-approval is on and purchases are not required', async () => {
    await prisma.setting.create({
      data: { key: 'reviews', value: { requireVerifiedPurchase: false, autoApprove: true } },
    })
    const shopper = await signedInCustomer('open-reviews@example.test')
    const { product } = await createProduct({ stock: 1 })
    const res = await post(shopper.client, reviewRoute, product.id, { ...review, rating: 5 })
    expect(res.body.data).toMatchObject({ review: { status: 'APPROVED' } })
    expect(
      await prisma.review.findFirstOrThrow({ where: { productId: product.id } }),
    ).toMatchObject({ isVerifiedPurchase: false })
    expect(await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).toMatchObject({
      ratingCount: 1,
      ratingAverage: 500,
    })
  })
})

describe('customers and messages', () => {
  it('suspending a customer signs them out and blocks the account', async () => {
    const customer = await signedInCustomer('suspend-me@example.test')
    const admin = await signedInStaff('suspender@example.test', 'ADMIN')
    expect(
      (await customer.client.call<{ data: { user: unknown } }>(sessionRoute)).body.data.user,
    ).not.toBeNull()
    const res = await post(admin.client, customerStatusRoute, customer.user.id, {
      status: 'SUSPENDED',
      reason: 'Chargeback fraud',
    })
    expect(res.status).toBe(200)
    expect(await prisma.session.count({ where: { userId: customer.user.id } })).toBe(0)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: customer.user.id } })).status).toBe(
      'SUSPENDED',
    )
    expect(
      await prisma.auditLog.count({
        where: { action: 'customer.suspended', entityId: customer.user.id },
      }),
    ).toBe(1)
    // Staff accounts are not managed here.
    expect(
      (
        await post(admin.client, customerStatusRoute, admin.user.id, {
          status: 'SUSPENDED',
          reason: 'Nope',
        })
      ).status,
    ).toBe(404)
  })

  it('reading a message has no side effects; status changes are explicit and audited', async () => {
    const message = await prisma.contactMessage.create({
      data: {
        name: 'Sara',
        email: 'sara@example.test',
        subject: 'Strap length',
        message: 'Can the strap be shortened?',
      },
    })
    await getMessage(message.id)
    expect(
      (await prisma.contactMessage.findUniqueOrThrow({ where: { id: message.id } })).status,
    ).toBe('NEW')
    const staff = await signedInStaff('inbox@example.test')
    await setMessageStatus(message.id, 'READ', staff.audit)
    expect(
      (await prisma.contactMessage.findUniqueOrThrow({ where: { id: message.id } })).status,
    ).toBe('READ')
    expect(
      await prisma.auditLog.count({ where: { action: 'message.read', entityId: message.id } }),
    ).toBe(1)
  })

  it('exports subscribed addresses as CSV for export-permitted staff only', async () => {
    await prisma.newsletterSubscriber.createMany({
      data: [
        { email: 'in@example.test', unsubscribeTokenHash: 'a'.repeat(64) },
        { email: 'out@example.test', status: 'UNSUBSCRIBED', unsubscribeTokenHash: 'b'.repeat(64) },
        { email: '=cmd@example.test', unsubscribeTokenHash: 'c'.repeat(64) },
      ],
    })
    const staff = await signedInStaff('no-export@example.test')
    expect((await staff.client.call(exportRoute)).status).toBe(403)
    const admin = await signedInStaff('exporter@example.test', 'ADMIN')
    const res = await admin.client.call<string>(exportRoute)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.body).toContain('in@example.test')
    expect(res.body).not.toContain('out@example.test')
    expect(res.body).toContain("'=cmd@example.test")
    expect(await prisma.auditLog.count({ where: { action: 'newsletter.exported' } })).toBe(1)
  })
})
