import { prisma } from '@/db/client'
import { logger } from '@/lib/logger'

/**
 * Liveness/readiness probe for load balancers, uptime monitors and
 * post-deploy smoke tests. Reports application and database health only —
 * never connection strings, credentials, versions of internal services or
 * other sensitive details.
 */
export async function GET(): Promise<Response> {
  const started = performance.now()
  let database: 'ok' | 'error' = 'ok'
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (error) {
    database = 'error'
    logger.error('health.database_unreachable', { error })
  }
  const healthy = database === 'ok'
  return Response.json(
    {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? 'unknown',
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      checks: { database },
      latencyMs: Math.round(performance.now() - started),
    },
    { status: healthy ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  )
}
