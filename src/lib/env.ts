import 'server-only'
import { z } from 'zod'

/**
 * Server environment configuration, validated once and cached.
 *
 * Validation fails fast with every problem listed, so a misconfigured
 * deployment refuses to start instead of failing later on a customer request.
 * Secrets are only ever read through this module and never exposed via
 * NEXT_PUBLIC_* variables.
 */

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1')

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim()))

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Deployment environment. Staging runs with NODE_ENV=production but APP_ENV=staging. */
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']).optional(),

    DATABASE_URL: z
      .string({ error: 'DATABASE_URL is required' })
      .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a PostgreSQL connection string'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

    NEXT_PUBLIC_APP_URL: z.url({ error: 'NEXT_PUBLIC_APP_URL must be an absolute URL' }),
    AUTH_SECRET: z.string({ error: 'AUTH_SECRET is required' }).min(32, 'AUTH_SECRET must be at least 32 characters'),
    TRUST_PROXY_HEADERS: booleanString,
    CRON_SECRET: optionalString,

    PAYMENT_PROVIDER: z.enum(['mock', 'moyasar']).default('mock'),
    MOCK_PAYMENT_WEBHOOK_SECRET: optionalString,
    MOYASAR_SECRET_KEY: optionalString,
    MOYASAR_PUBLISHABLE_KEY: optionalString,
    MOYASAR_WEBHOOK_SECRET: optionalString,
    PAYMENT_SESSION_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(20),
    INVENTORY_RESERVATION_TTL_MINUTES: z.coerce.number().int().min(10).max(240).default(30),

    SHIPPING_PROVIDER: z.enum(['manual', 'mock']).default('manual'),

    EMAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
    RESEND_API_KEY: optionalString,
    EMAIL_FROM: optionalString,
    SMS_PROVIDER: z.enum(['console', 'none']).default('none'),
    WHATSAPP_PROVIDER: z.enum(['console', 'none']).default('none'),

    STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
    STORAGE_BUCKET: optionalString,
    STORAGE_REGION: optionalString,
    STORAGE_ENDPOINT: optionalString,
    STORAGE_ACCESS_KEY_ID: optionalString,
    STORAGE_SECRET_ACCESS_KEY: optionalString,
    STORAGE_PUBLIC_BASE_URL: optionalString,

    RATE_LIMIT_PROVIDER: z.enum(['postgres', 'memory']).default('postgres'),
    ANALYTICS_PROVIDER: z.enum(['none', 'console', 'ga4']).default('none'),

    ALLOW_MOCK_PROVIDERS_IN_PRODUCTION: booleanString,
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  })
  .superRefine((env, ctx) => {
    const isProd = env.NODE_ENV === 'production'
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })

    if (env.PAYMENT_PROVIDER === 'mock' && !env.MOCK_PAYMENT_WEBHOOK_SECRET) {
      issue('MOCK_PAYMENT_WEBHOOK_SECRET', 'required when PAYMENT_PROVIDER=mock')
    }
    if (env.PAYMENT_PROVIDER === 'moyasar') {
      for (const key of ['MOYASAR_SECRET_KEY', 'MOYASAR_PUBLISHABLE_KEY', 'MOYASAR_WEBHOOK_SECRET'] as const) {
        if (!env[key]) issue(key, 'required when PAYMENT_PROVIDER=moyasar')
      }
    }
    if (env.EMAIL_PROVIDER === 'resend') {
      if (!env.RESEND_API_KEY) issue('RESEND_API_KEY', 'required when EMAIL_PROVIDER=resend')
      if (!env.EMAIL_FROM) issue('EMAIL_FROM', 'required when EMAIL_PROVIDER=resend')
    }
    if (env.STORAGE_PROVIDER === 's3') {
      for (const key of [
        'STORAGE_BUCKET',
        'STORAGE_REGION',
        'STORAGE_ACCESS_KEY_ID',
        'STORAGE_SECRET_ACCESS_KEY',
        'STORAGE_PUBLIC_BASE_URL',
      ] as const) {
        if (!env[key]) issue(key, 'required when STORAGE_PROVIDER=s3')
      }
    }
    if (isProd) {
      if (!env.CRON_SECRET || env.CRON_SECRET.length < 32) {
        issue('CRON_SECRET', 'must be set (min 32 characters) in production')
      }
      if (env.PAYMENT_PROVIDER === 'mock' && !env.ALLOW_MOCK_PROVIDERS_IN_PRODUCTION) {
        issue(
          'PAYMENT_PROVIDER',
          'the mock payment provider is development-only; configure a real provider or set ALLOW_MOCK_PROVIDERS_IN_PRODUCTION=true for a non-public staging demo',
        )
      }
      if (env.SHIPPING_PROVIDER === 'mock' && !env.ALLOW_MOCK_PROVIDERS_IN_PRODUCTION) {
        issue('SHIPPING_PROVIDER', 'the mock shipping provider is development-only')
      }
      if (env.STORAGE_PROVIDER === 'local' && !env.ALLOW_MOCK_PROVIDERS_IN_PRODUCTION) {
        issue('STORAGE_PROVIDER', 'local file storage is not durable on serverless hosts; configure s3')
      }
      if (env.RATE_LIMIT_PROVIDER === 'memory') {
        issue('RATE_LIMIT_PROVIDER', 'in-memory rate limiting is not shared across instances; use postgres')
      }
      if (/^http:\/\//.test(env.NEXT_PUBLIC_APP_URL) && !/localhost|127\.0\.0\.1/.test(env.NEXT_PUBLIC_APP_URL)) {
        issue('NEXT_PUBLIC_APP_URL', 'must use https in production')
      }
    }
  })

export type ServerEnv = z.infer<typeof EnvSchema> & { appEnv: 'development' | 'test' | 'staging' | 'production' }

let cached: ServerEnv | undefined

export class EnvValidationError extends Error {
  override name = 'EnvValidationError'
}

export function parseEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = EnvSchema.safeParse(source)
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new EnvValidationError(`Invalid environment configuration:\n${lines.join('\n')}`)
  }
  const data = result.data
  const appEnv = data.APP_ENV ?? (data.NODE_ENV === 'production' ? 'production' : data.NODE_ENV)
  return { ...data, appEnv }
}

/** Validated server environment (parsed lazily on first use, then cached). */
export function env(): ServerEnv {
  cached ??= parseEnv(process.env)
  return cached
}

/** Test hook: forget the cached environment after mutating process.env. */
export function resetEnvCache(): void {
  cached = undefined
}

export function appOrigin(): string {
  return new URL(env().NEXT_PUBLIC_APP_URL).origin
}
