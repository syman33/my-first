import 'server-only'
import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { captureException } from '@/lib/monitoring'
import { safeEqual } from '@/lib/security/tokens'

/**
 * Scheduled-job endpoint: callable only with `Authorization: Bearer
 * <CRON_SECRET>` (compared in constant time). Without a configured secret
 * the endpoint is disabled. Jobs are idempotent, so retries are harmless.
 */
export function cronHandler(name: string, job: () => Promise<Record<string, unknown>>) {
  return async function runCron(req: NextRequest): Promise<NextResponse> {
    const secret = env().CRON_SECRET
    const header = req.headers.get('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!secret || !token || !safeEqual(token, secret)) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
        { status: 401, headers: { 'cache-control': 'no-store' } },
      )
    }
    const started = Date.now()
    try {
      const result = await job()
      logger.info('cron.completed', { job: name, durationMs: Date.now() - started, ...result })
      return NextResponse.json(
        { data: { job: name, ...result } },
        { headers: { 'cache-control': 'no-store' } },
      )
    } catch (error) {
      logger.error('cron.failed', { job: name, error })
      void captureException(error, { job: name })
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Job failed' } },
        { status: 500, headers: { 'cache-control': 'no-store' } },
      )
    }
  }
}
