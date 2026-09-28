/**
 * Environment for automated tests, shared by vitest.config.mts (worker env)
 * and the integration global setup (which runs in the main process, where
 * Vitest's per-project `env` is not applied).
 */
export const integrationDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgresql://velora:velora_dev_password@localhost:5432/velora_test'

export const sharedTestEnv = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  AUTH_SECRET: 'test-auth-secret-that-is-long-enough-for-hmac-0123456789',
  CRON_SECRET: 'test-cron-secret-0123456789abcdef0123456789abcdef',
  PAYMENT_PROVIDER: 'mock',
  MOCK_PAYMENT_WEBHOOK_SECRET: 'test-mock-webhook-secret-0123456789',
  SHIPPING_PROVIDER: 'mock',
  EMAIL_PROVIDER: 'console',
  STORAGE_PROVIDER: 'local',
  RATE_LIMIT_PROVIDER: 'postgres',
  VELORA_SILENT_LOGS: 'true',
} as const
