import { cronHandler } from '@/lib/api/cron'
import { releaseExpiredReservations } from '@/services/orders/order-lifecycle.service'

/** Run every few minutes: frees stock held by unpaid online orders past their payment window. */
export const POST = cronHandler('release-reservations', async () => releaseExpiredReservations())
