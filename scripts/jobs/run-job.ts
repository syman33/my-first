/**
 * Run a scheduled job from the command line (e.g. a platform cron or a
 * one-off maintenance run):
 *
 *   npm run jobs:run -- outbox
 *   npm run jobs:run -- release-reservations
 *   npm run jobs:run -- cleanup
 *
 * The same functions back the /api/cron/* endpoints; jobs are idempotent.
 */
import { createRequire } from 'node:module'
import type * as NextEnv from '@next/env'

// @next/env is a CommonJS bundle whose named exports Node's ESM loader cannot detect.
const { loadEnvConfig } = createRequire(import.meta.url)('@next/env') as typeof NextEnv

loadEnvConfig(process.cwd())

const JOBS = ['outbox', 'release-reservations', 'cleanup'] as const
type Job = (typeof JOBS)[number]

async function run(job: Job): Promise<Record<string, unknown>> {
  switch (job) {
    case 'outbox': {
      const { processPendingEvents } = await import('../../src/services/events/process')
      return { ...(await processPendingEvents(500)) }
    }
    case 'release-reservations': {
      const { releaseExpiredReservations } =
        await import('../../src/services/orders/order-lifecycle.service')
      return releaseExpiredReservations()
    }
    case 'cleanup': {
      const { runCleanup } = await import('../../src/services/maintenance/cleanup.service')
      return runCleanup()
    }
  }
}

async function main() {
  const job = process.argv[2]
  if (!job || !(JOBS as readonly string[]).includes(job)) {
    console.error(`Usage: npm run jobs:run -- <${JOBS.join('|')}>`)
    process.exit(2)
  }
  const started = Date.now()
  const result = await run(job as Job)
  console.log(JSON.stringify({ job, durationMs: Date.now() - started, ...result }))
  const { prisma } = await import('../../src/db/client')
  await prisma.$disconnect()
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
