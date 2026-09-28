import path from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Two test projects:
 * - unit:        pure logic (money, pricing, state machines, validation). No I/O.
 * - integration: services, repositories and API route handlers against a real
 *                PostgreSQL test database (migrated fresh per run). Files run
 *                serially because they share one database.
 */
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgresql://velora:velora_dev_password@localhost:5432/velora_test'

const sharedEnv = {
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

export default defineConfig({
  resolve: {
    alias: {
      '@tests': path.resolve(import.meta.dirname, 'tests'),
      '@': path.resolve(import.meta.dirname, 'src'),
      // `server-only` throws outside a React Server environment; tests run server code directly.
      'server-only': path.resolve(import.meta.dirname, 'tests/support/server-only-stub.ts'),
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/**/*.d.ts', 'src/app/**/page.tsx', 'src/app/**/layout.tsx'],
      reporter: ['text-summary', 'html'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          env: { ...sharedEnv, DATABASE_URL: 'postgresql://unit:unit@localhost:1/unit_tests_do_not_touch_db' },
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          env: { ...sharedEnv, DATABASE_URL: testDatabaseUrl },
          globalSetup: ['tests/integration/global-setup.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
})
