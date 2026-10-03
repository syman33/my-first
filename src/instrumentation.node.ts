import { type Instrumentation } from 'next'
import { env, EnvValidationError, type ServerEnv } from '@/lib/env'
import { logger } from '@/lib/logger'
import { captureException } from '@/lib/monitoring'

/**
 * Node.js startup: validate configuration so a misconfigured deployment
 * fails immediately instead of on a customer's checkout.
 */
export async function registerNode(): Promise<void> {
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  let config: ServerEnv
  try {
    config = env()
  } catch (error) {
    if (error instanceof EnvValidationError && process.env.NODE_ENV === 'production') {
      // Fail closed: a misconfigured production instance must not serve traffic.
      logger.error('server.invalid_configuration', { error })
      process.exit(1)
    }
    throw error
  }

  logger.info('server.start', {
    appEnv: config.appEnv,
    paymentProvider: config.PAYMENT_PROVIDER,
    shippingProvider: config.SHIPPING_PROVIDER,
    emailProvider: config.EMAIL_PROVIDER,
    storageProvider: config.STORAGE_PROVIDER,
    rateLimitProvider: config.RATE_LIMIT_PROVIDER,
  })

  if (config.appEnv === 'production' || config.appEnv === 'staging') {
    const { reportInsecureProductionState } = await import('@/lib/startup-checks')
    await reportInsecureProductionState()
  }
}

export async function reportRequestError(
  ...[error, request, context]: Parameters<Instrumentation.onRequestError>
): Promise<void> {
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error
      ? String((error as { digest: unknown }).digest)
      : undefined
  logger.error('request.unhandled_error', {
    error,
    digest,
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  })
  await captureException(error, { digest, path: request.path, routeType: context.routeType })
}
