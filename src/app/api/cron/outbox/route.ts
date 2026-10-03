import { cronHandler } from '@/lib/api/cron'
import { processPendingEvents } from '@/services/events/process'

/** Run every minute: delivers queued notifications and retries failed ones with backoff. */
export const POST = cronHandler('outbox', async () => ({ ...(await processPendingEvents(100)) }))
