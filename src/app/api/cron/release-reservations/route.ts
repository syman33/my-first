import { cronHandler } from '@/lib/api/cron'
import { releaseExpiredReservations } from '@/services/orders/order-lifecycle.service'

/** Run every few minutes: frees stock held by unpaid online orders past their payment window. */
const run = cronHandler('release-reservations', async () => releaseExpiredReservations())

// Vercel Cron calls with GET (plus the bearer secret); POST is kept for manual triggers.
export const GET = run
export const POST = run
