import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { retryNotification } from '@/services/admin/logs.service'
import { processPendingEvents } from '@/services/events/process'

/** Send a failed message again (re-runs its outbox event; already-delivered messages are skipped). */
export const POST = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'NOTIFICATIONS_VIEW', rateLimit: adminWriteLimit },
  async (ctx) => {
    await retryNotification(routeId(ctx.params.id), ctx.audit)
    ctx.afterResponse(() => processPendingEvents())
    return ok({ queued: true })
  },
)
