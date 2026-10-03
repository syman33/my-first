import 'server-only'
import { logger } from '@/lib/logger'
import { registerEngagementNotificationHandlers } from '@/services/notifications/engagement-handlers'
import { registerAccountNotificationHandlers } from '@/services/notifications/handlers'
import { processOutbox, type OutboxRunResult } from './outbox.service'

let handlersReady = false

/** Register every outbox handler exactly once per process. */
export function ensureOutboxHandlers(): void {
  if (handlersReady) return
  handlersReady = true
  registerAccountNotificationHandlers()
  registerEngagementNotificationHandlers()
}

/**
 * Process due outbox events. Called right after a response is sent (fast
 * path) and by the cron job (retries, recovery after crashes).
 */
export async function processPendingEvents(limit = 20): Promise<OutboxRunResult> {
  ensureOutboxHandlers()
  const result = await processOutbox({ limit })
  if (result.processed + result.failed + result.deadLettered > 0)
    logger.info('outbox.batch', { ...result })
  return result
}
