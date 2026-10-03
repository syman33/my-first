import 'server-only'
import { prisma } from '@/db/client'
import { Prisma } from '@/generated/prisma/client'
import { hasPermission, type Principal } from '@/lib/auth/permissions'
import { averageOrderValue, SALE_STATUSES } from '@/lib/admin/metrics'
import {
  addDays,
  addHours,
  type DateRangePreset,
  eachStoreDay,
  resolveDateRange,
  STORE_TIME_ZONE,
} from '@/utils/time'

/**
 * Dashboard figures, computed in PostgreSQL from the orders, refunds and
 * users tables (see `lib/admin/metrics.ts` for the definitions). Nothing
 * here is estimated or cached: every number is the current database state.
 */

export interface PeriodTotals {
  sales: number
  orders: number
  averageOrderValue: number
  refunds: number
  newCustomers: number
}

export interface SalesPoint {
  /** `YYYY-MM-DD` (daily) or `HH` (hourly, store time). */
  key: string
  sales: number
  orders: number
}

export interface DashboardSummary {
  range: DateRangePreset
  from: Date
  to: Date
  current: PeriodTotals
  previous: PeriodTotals
  granularity: 'hour' | 'day'
  series: SalesPoint[]
}

const saleStatusList = Prisma.join(SALE_STATUSES.map((status) => Prisma.sql`${status}`))

async function periodTotals(from: Date, to: Date): Promise<PeriodTotals> {
  const [orders, refunds, newCustomers] = await Promise.all([
    prisma.$queryRaw<{ sales: bigint | null; orders: bigint }[]>`
      SELECT COALESCE(SUM(total), 0)::bigint AS sales, COUNT(*)::bigint AS orders
        FROM orders
       WHERE created_at >= ${from} AND created_at < ${to}
         AND status::text IN (${saleStatusList})`,
    prisma.refund.aggregate({
      where: { status: 'SUCCEEDED', completedAt: { gte: from, lt: to } },
      _sum: { amount: true },
    }),
    prisma.user.count({ where: { role: 'CUSTOMER', createdAt: { gte: from, lt: to } } }),
  ])
  const sales = Number(orders[0]?.sales ?? 0n)
  const count = Number(orders[0]?.orders ?? 0n)
  return {
    sales,
    orders: count,
    averageOrderValue: averageOrderValue(sales, count),
    refunds: refunds._sum.amount ?? 0,
    newCustomers,
  }
}

async function salesSeries(
  from: Date,
  to: Date,
  granularity: 'hour' | 'day',
): Promise<SalesPoint[]> {
  const unit = granularity === 'hour' ? Prisma.sql`'hour'` : Prisma.sql`'day'`
  const format = granularity === 'hour' ? Prisma.sql`'HH24'` : Prisma.sql`'YYYY-MM-DD'`
  const rows = await prisma.$queryRaw<{ bucket: string; sales: bigint; orders: bigint }[]>`
    SELECT to_char(date_trunc(${unit}, created_at AT TIME ZONE ${STORE_TIME_ZONE}), ${format}) AS bucket,
           SUM(total)::bigint AS sales,
           COUNT(*)::bigint AS orders
      FROM orders
     WHERE created_at >= ${from} AND created_at < ${to}
       AND status::text IN (${saleStatusList})
     GROUP BY 1`
  const byBucket = new Map(rows.map((row) => [row.bucket, row]))
  // Every bucket appears, including the quiet ones (a gap is a real zero).
  const keys =
    granularity === 'hour'
      ? Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))
      : eachStoreDay(from, to)
  return keys.map((key) => {
    const row = byBucket.get(key)
    return { key, sales: Number(row?.sales ?? 0n), orders: Number(row?.orders ?? 0n) }
  })
}

export async function getDashboardSummary(
  range: DateRangePreset,
  now: Date = new Date(),
): Promise<DashboardSummary> {
  const { from, to } = resolveDateRange(range, now)
  const days = range === 'today' ? 1 : range === '7d' ? 7 : 30
  // The previous period has the same length and ends where this one starts.
  const previousFrom = range === 'today' ? addHours(from, -24) : addDays(from, -days)
  const granularity = range === 'today' ? 'hour' : 'day'
  const [current, previous, series] = await Promise.all([
    periodTotals(from, to),
    periodTotals(previousFrom, from),
    salesSeries(from, to, granularity),
  ])
  return { range, from, to, current, previous, granularity, series }
}

export interface AttentionCounts {
  ordersFlagged: number | null
  codAwaitingConfirmation: number | null
  readyToShip: number | null
  returnsToReview: number | null
  returnsToRefund: number | null
  refundsPending: number | null
  lowStock: number | null
  reviewsPending: number | null
  messagesNew: number | null
  notificationsFailed: number | null
}

/** Work waiting for the team; null where the viewer may not see that area. */
export async function getAttentionCounts(principal: Principal): Promise<AttentionCounts> {
  const can = (permission: Parameters<typeof hasPermission>[1]) =>
    hasPermission(principal, permission)
  const orders = can('ORDERS_VIEW')
  const staleRefund = new Date(Date.now() - 15 * 60 * 1000)
  const [
    ordersFlagged,
    codAwaitingConfirmation,
    readyToShip,
    returnsToReview,
    returnsToRefund,
    refundsPending,
    lowStock,
    reviewsPending,
    messagesNew,
    notificationsFailed,
  ] = await Promise.all([
    orders ? prisma.order.count({ where: { attentionReason: { not: null } } }) : null,
    orders ? prisma.order.count({ where: { status: 'PENDING', paymentMethod: 'COD' } }) : null,
    orders ? prisma.order.count({ where: { status: { in: ['CONFIRMED', 'PROCESSING'] } } }) : null,
    orders ? prisma.returnRequest.count({ where: { status: 'REQUESTED' } }) : null,
    orders ? prisma.returnRequest.count({ where: { status: 'RECEIVED' } }) : null,
    orders
      ? prisma.refund.count({ where: { status: 'PENDING', createdAt: { lt: staleRefund } } })
      : null,
    can('INVENTORY_VIEW')
      ? prisma.$queryRaw<{ n: bigint }[]>`
          SELECT COUNT(*)::bigint AS n
            FROM inventory i
            JOIN product_variants v ON v.id = i.variant_id
            JOIN products p ON p.id = v.product_id
           WHERE p.status = 'PUBLISHED' AND v.is_active
             AND i.on_hand - i.reserved <= COALESCE(i.low_stock_threshold, p.low_stock_threshold)`.then(
          (rows) => Number(rows[0]?.n ?? 0n),
        )
      : null,
    can('REVIEWS_MODERATE') ? prisma.review.count({ where: { status: 'PENDING' } }) : null,
    can('MESSAGES_VIEW') ? prisma.contactMessage.count({ where: { status: 'NEW' } }) : null,
    can('NOTIFICATIONS_VIEW') ? prisma.notification.count({ where: { status: 'FAILED' } }) : null,
  ])
  return {
    ordersFlagged,
    codAwaitingConfirmation,
    readyToShip,
    returnsToReview,
    returnsToRefund,
    refundsPending,
    lowStock,
    reviewsPending,
    messagesNew,
    notificationsFailed,
  }
}

export async function getRecentOrders(limit = 8) {
  return prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      paymentMethod: true,
      total: true,
      createdAt: true,
      shippingName: true,
    },
  })
}

export interface TopProduct {
  productId: string | null
  nameAr: string
  nameEn: string
  units: number
  sales: number
}

/** Best sellers by units in the period (confirmed sales only, from the order snapshots). */
export async function getTopProducts(from: Date, to: Date, limit = 5): Promise<TopProduct[]> {
  const rows = await prisma.$queryRaw<
    { product_id: string | null; name_ar: string; name_en: string; units: bigint; sales: bigint }[]
  >`
    SELECT oi.product_id,
           MIN(oi.product_name_ar) AS name_ar,
           MIN(oi.product_name_en) AS name_en,
           SUM(oi.quantity)::bigint AS units,
           SUM(oi.line_total)::bigint AS sales
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
     WHERE o.created_at >= ${from} AND o.created_at < ${to}
       AND o.status::text IN (${saleStatusList})
     GROUP BY oi.product_id, CASE WHEN oi.product_id IS NULL THEN oi.sku END
     ORDER BY units DESC, sales DESC
     LIMIT ${limit}`
  return rows.map((row) => ({
    productId: row.product_id,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    units: Number(row.units),
    sales: Number(row.sales),
  }))
}
