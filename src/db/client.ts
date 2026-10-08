import 'server-only'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, type Prisma } from '@/generated/prisma/client'

/**
 * Prisma client singleton.
 *
 * One client (and therefore one connection pool) per server process. In
 * development the instance is cached on `globalThis` so hot reloads do not
 * leak pools. On serverless hosts, point DATABASE_URL at a pooled endpoint
 * (PgBouncer / Neon pooler / Supabase pooler) and keep DATABASE_POOL_MAX low.
 */

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    // Fail fast instead of queueing forever when the pool is exhausted.
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  })
  return new PrismaClient({
    adapter,
    log: process.env.PRISMA_LOG_QUERIES === 'true' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  })
}

const globalForPrisma = globalThis as unknown as { __veloraPrisma?: PrismaClient }

export const prisma: PrismaClient = globalForPrisma.__veloraPrisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__veloraPrisma = prisma
}

/** Either the root client or an interactive-transaction client. Repositories accept both. */
export type DbClient = PrismaClient | Prisma.TransactionClient

type ReadResults<T extends readonly (() => Promise<unknown>)[]> = {
  -readonly [K in keyof T]: T[K] extends () => Promise<infer R> ? R : never
}

/**
 * Run independent reads. On the pool they run in parallel; a transaction has a
 * single connection, where concurrent queries would only queue (and the pg
 * driver is removing support for them), so they run one after another.
 */
export async function readAll<const T extends readonly (() => Promise<unknown>)[]>(
  db: DbClient,
  reads: T,
): Promise<ReadResults<T>> {
  if (db === prisma) return (await Promise.all(reads.map((read) => read()))) as ReadResults<T>
  const results: unknown[] = []
  for (const read of reads) results.push(await read())
  return results as ReadResults<T>
}
