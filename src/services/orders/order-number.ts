import 'server-only'
import type { DbClient } from '@/db/client'
import { storeYear } from '@/utils/time'

/**
 * Customer-facing order numbers: VLR-2026-000123. Drawn from a PostgreSQL
 * sequence — unique without serialising checkouts (gaps after a rollback are
 * expected and harmless). Internal ids stay UUIDs and are never shown.
 */
export async function nextOrderNumber(tx: DbClient, now: Date = new Date()): Promise<string> {
  const rows = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`
  const n = rows[0]?.n ?? 0n
  return `VLR-${storeYear(now)}-${n.toString().padStart(6, '0')}`
}
