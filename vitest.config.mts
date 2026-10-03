import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { integrationDatabaseUrl, sharedTestEnv } from './tests/support/test-env.ts'

/**
 * Two test projects:
 * - unit:        pure logic (money, pricing, state machines, validation). No I/O.
 * - integration: services, repositories and API route handlers against a real
 *                PostgreSQL test database (migrated fresh per run). Files run
 *                serially because they share one database.
 */
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
      exclude: [
        'src/generated/**',
        'src/**/*.d.ts',
        'src/app/**/page.tsx',
        'src/app/**/layout.tsx',
      ],
      reporter: ['text-summary', 'html'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          // Deliberately unreachable: unit tests must never touch a database.
          env: {
            ...sharedTestEnv,
            DATABASE_URL: 'postgresql://unit:unit@127.0.0.1:1/unit_tests_do_not_touch_db',
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          env: { ...sharedTestEnv, DATABASE_URL: integrationDatabaseUrl },
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
