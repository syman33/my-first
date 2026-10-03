import { prisma } from '@/db/client'
import { assertDisposableDatabase } from '../../../scripts/db/safety'

let tableList: string | undefined

/**
 * Truncate every application table (fast, resets sequences). TRUNCATE does not
 * fire the row-level append-only trigger on audit_logs, so tests can start clean.
 */
export async function resetDatabase(): Promise<void> {
  assertDisposableDatabase(process.env.DATABASE_URL)
  if (!tableList) {
    const rows = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
    tableList = rows.map((r) => `"public"."${r.tablename}"`).join(', ')
  }
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`)
  await prisma.$executeRawUnsafe('ALTER SEQUENCE order_number_seq RESTART WITH 1')
  await prisma.$executeRawUnsafe('ALTER SEQUENCE return_number_seq RESTART WITH 1')
}
