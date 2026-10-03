import { apiHandler } from '@/lib/api/handler'
import { csvHeaders, toCsv } from '@/lib/csv'
import { exportSubscribers } from '@/services/admin/customers.service'
import { toStoreDateKey } from '@/utils/time'

/** CSV of subscribed addresses (export permission; the export itself is audited). */
export const GET = apiHandler({ auth: 'staff', permission: 'IMPORT_EXPORT' }, async (ctx) => {
  const rows = await exportSubscribers(ctx.audit)
  const csv = toCsv(rows, [
    { key: 'email', header: 'email' },
    { key: 'locale', header: 'locale' },
    { key: 'source', header: 'source' },
    { key: 'subscribedAt', header: 'subscribed_at' },
  ])
  return new Response(csv, {
    headers: csvHeaders(`velora-newsletter-${toStoreDateKey(new Date())}.csv`),
  })
})
