import * as z from 'zod'
import { requireAlso } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { csvHeaders, toCsv } from '@/lib/csv'
import { ORDER_EXPORT_COLUMNS, exportOrders } from '@/services/admin/exports.service'
import { addDays, parseStoreDateKey, toStoreDateKey } from '@/utils/time'

const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
] as const

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'date' })
  .optional()
  .or(z.literal('').transform(() => undefined))

const querySchema = z.object({
  from: dateKey,
  to: dateKey,
  status: z
    .enum(ORDER_STATUSES)
    .optional()
    .or(z.literal('').transform(() => undefined)),
})

/** Orders as CSV for accounting (store-time dates, SAR amounts). `to` is inclusive. */
export const GET = apiHandler(
  {
    auth: 'staff',
    permission: 'IMPORT_EXPORT',
    rateLimit: (ctx) => [{ rule: RATE_LIMITS.exports, subject: ctx.user?.id ?? ctx.ip }],
  },
  async (ctx) => {
    requireAlso(ctx.user, 'ORDERS_VIEW')
    const query = ctx.query(querySchema)
    const rows = await exportOrders(
      {
        from: query.from ? parseStoreDateKey(query.from) : undefined,
        to: query.to ? addDays(parseStoreDateKey(query.to), 1) : undefined,
        status: query.status,
      },
      ctx.audit,
    )
    const columns = ORDER_EXPORT_COLUMNS.map((column) => ({ key: column, header: column }))
    return new Response(toCsv(rows, columns), {
      headers: csvHeaders(`velora-orders-${toStoreDateKey(new Date())}.csv`),
    })
  },
)
