import { cronHandler } from '@/lib/api/cron'
import { processPendingEvents } from '@/services/events/process'

/** Run every minute: delivers queued notifications and retries failed ones with backoff. */
const run = cronHandler('outbox', async () => ({ ...(await processPendingEvents(100)) }))

// Vercel Cron calls with GET (plus the bearer secret); POST is kept for manual triggers.
export const GET = run
export const POST = run
