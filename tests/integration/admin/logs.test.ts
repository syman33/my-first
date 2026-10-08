import type { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { POST as retryRoute } from '@/app/api/admin/notifications/[id]/retry/route'
import { prisma } from '@/db/client'
import { listAuditLogs, listNotifications } from '@/services/admin/logs.service'
import { recordAudit, SYSTEM_ACTOR } from '@/services/audit/audit.service'
import { signedInStaff } from '../helpers/checkout'
import type { TestClient } from '../helpers/http'

type Body = {
  data?: Record<string, unknown>
  error?: { code: string; details?: Record<string, unknown> }
}
type IdRoute = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>

const retry = (client: TestClient, id: string) =>
  client.call<Body, { id: string }>(retryRoute as IdRoute, { params: { id }, body: {} })

async function failedNotification(eventStatus: 'FAILED' | 'PROCESSED', payload: object) {
  const event = await prisma.outboxEvent.create({
    data: {
      type: 'ORDER_SHIPPED',
      payload,
      status: eventStatus,
      attempts: eventStatus === 'FAILED' ? 8 : 1,
      lastError: 'SMTP 421',
      processedAt: eventStatus === 'PROCESSED' ? new Date() : null,
    },
  })
  return prisma.notification.create({
    data: {
      outboxEventId: event.id,
      channel: 'EMAIL',
      template: 'order-shipped',
      recipient: 'noura@example.test',
      status: 'FAILED',
      provider: 'resend',
      error: 'Recipient mailbox unavailable',
      attempts: eventStatus === 'FAILED' ? 8 : 1,
    },
  })
}

describe('notification log', () => {
  it('re-queues a failed message once, and refuses messages whose secure link expired', async () => {
    const admin = await signedInStaff('logs-admin@example.test', 'ADMIN')
    const staff = await signedInStaff('logs-staff@example.test')
    const failed = await failedNotification('FAILED', {
      orderId: '0190a8f2-1c3d-7e4f-8a9b-0c1d2e3f4a5b',
      shipmentId: 'x',
    })

    expect((await retry(staff.client, failed.id)).status).toBe(403)
    const queued = await retry(admin.client, failed.id)
    expect(queued.status).toBe(200)
    expect(
      await prisma.outboxEvent.findUniqueOrThrow({ where: { id: failed.outboxEventId! } }),
    ).toMatchObject({
      status: 'PENDING',
      attempts: 0,
      lastError: null,
    })
    const again = await retry(admin.client, failed.id)
    expect(again.status).toBe(409)
    expect(again.body.error?.details).toMatchObject({ reason: 'SCHEDULED' })
    expect(
      await prisma.auditLog.count({
        where: { action: 'notification.retry_requested', entityId: failed.id },
      }),
    ).toBe(1)

    const reset = await failedNotification('FAILED', { userId: 'u', sealedResetUrl: '[purged]' })
    const expired = await retry(admin.client, reset.id)
    expect(expired.status).toBe(409)
    expect(expired.body.error?.details).toMatchObject({ reason: 'LINK_EXPIRED' })

    const list = await listNotifications({ status: 'FAILED' }, 1, 25)
    expect(list.failed).toBe(2)
    expect(list.rows.map((row) => row.retry).sort()).toEqual(['LINK_EXPIRED', 'SCHEDULED'])
  })
})

describe('audit log', () => {
  it('filters by actor type, item type, search and date range', async () => {
    const admin = await signedInStaff('audit-admin@example.test', 'ADMIN')
    const orderId = '0190a8f2-1c3d-7e4f-8a9b-0c1d2e3f4a5b'
    await recordAudit(prisma, admin.audit, {
      action: 'order.cancelled',
      entityType: 'order',
      entityId: orderId,
    })
    await recordAudit(
      prisma,
      { actor: SYSTEM_ACTOR },
      { action: 'orders.reservations_released', entityType: 'order' },
    )
    await recordAudit(prisma, admin.audit, {
      action: 'settings.updated',
      entityType: 'settings',
      entityId: 'shipping',
      metadata: { changes: { standardFee: { from: 2_500, to: 1_950 } } },
    })

    const byAdmin = await listAuditLogs({ actorType: 'ADMIN' }, 1, 25)
    expect(byAdmin.rows.map((row) => row.action).sort()).toEqual([
      'order.cancelled',
      'settings.updated',
    ])
    expect((await listAuditLogs({ entityType: 'settings' }, 1, 25)).total).toBe(1)
    expect((await listAuditLogs({ q: orderId }, 1, 25)).rows[0]?.action).toBe('order.cancelled')
    expect((await listAuditLogs({ q: 'RESERVATIONS' }, 1, 25)).rows[0]?.actorType).toBe('SYSTEM')
    expect((await listAuditLogs({ actorId: admin.user.id }, 1, 25)).total).toBe(2)
    expect((await listAuditLogs({ from: new Date(Date.now() + 60_000) }, 1, 25)).total).toBe(0)
  })
})
