import { execFileSync } from 'node:child_process'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../src/generated/prisma/client'
import { assertDisposableDatabase } from '../db/safety'

/**
 * Prepares the disposable E2E database:
 *  1. `prisma migrate deploy` — apply committed migrations (same as production);
 *  2. truncate every table (guarded: only *_test / *_e2e databases);
 *  3. load the demo seed.
 */
const databaseUrl = process.env.DATABASE_URL
const target = assertDisposableDatabase(databaseUrl)
console.log(`[e2e] preparing ${target}`)

const run = (args: string[]) =>
  execFileSync('npx', args, { stdio: 'inherit', env: { ...process.env, SEED_PROFILE: 'demo' } })

run(['prisma', 'migrate', 'deploy'])

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
try {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (tables.length > 0) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${tables.map((t) => `"public"."${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
    )
  }
  await prisma.$executeRawUnsafe('ALTER SEQUENCE order_number_seq RESTART WITH 1')
  await prisma.$executeRawUnsafe('ALTER SEQUENCE return_number_seq RESTART WITH 1')
} finally {
  await prisma.$disconnect()
}

run(['prisma', 'db', 'seed'])
console.log('[e2e] database ready')
