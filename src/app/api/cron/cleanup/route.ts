import { cronHandler } from '@/lib/api/cron'
import { runCleanup } from '@/services/maintenance/cleanup.service'

/** Run hourly: removes expired sessions, tokens, rate-limit windows and abandoned guest bags. */
const run = cronHandler('cleanup', async () => runCleanup())

// Vercel Cron calls with GET (plus the bearer secret); POST is kept for manual triggers.
export const GET = run
export const POST = run
