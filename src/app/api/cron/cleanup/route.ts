import { cronHandler } from '@/lib/api/cron'
import { runCleanup } from '@/services/maintenance/cleanup.service'

/** Run hourly: removes expired sessions, tokens, rate-limit windows and abandoned guest bags. */
export const POST = cronHandler('cleanup', async () => runCleanup())
