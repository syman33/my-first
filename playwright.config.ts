import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests run against a production build (`next build && next start`)
 * backed by a dedicated, freshly migrated + seeded database (velora_e2e).
 *
 * Browsers: Chromium (desktop + mobile viewport) always; Firefox and WebKit
 * when E2E_ALL_BROWSERS=1 (CI installs them with `npx playwright install --with-deps`).
 */
const PORT = Number(process.env.E2E_PORT ?? 3200)
const BASE_URL = `http://localhost:${PORT}`
const allBrowsers = process.env.E2E_ALL_BROWSERS === '1'
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE

export const e2eServerEnv = {
  NODE_ENV: 'production',
  APP_ENV: 'test',
  DATABASE_URL:
    process.env.E2E_DATABASE_URL ??
    'postgresql://velora:velora_dev_password@localhost:5432/velora_e2e',
  NEXT_PUBLIC_APP_URL: BASE_URL,
  AUTH_SECRET: 'e2e-auth-secret-that-is-long-enough-for-hmac-0123456789',
  CRON_SECRET: 'e2e-cron-secret-0123456789abcdef0123456789abcdef',
  PAYMENT_PROVIDER: 'mock',
  MOCK_PAYMENT_WEBHOOK_SECRET: 'e2e-mock-webhook-secret-0123456789',
  SHIPPING_PROVIDER: 'mock',
  EMAIL_PROVIDER: 'console',
  STORAGE_PROVIDER: 'local',
  RATE_LIMIT_PROVIDER: 'postgres',
  ALLOW_MOCK_PROVIDERS_IN_PRODUCTION: 'true',
  NEXT_TELEMETRY_DISABLED: '1',
  LOG_LEVEL: 'warn',
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ar-SA',
    timezoneId: 'Asia/Riyadh',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}),
      },
    },
    {
      name: 'mobile-chromium',
      testMatch: /.*\.(mobile|smoke)\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}),
      },
    },
    ...(allBrowsers
      ? [
          {
            name: 'firefox',
            testMatch: /.*\.(smoke|cross)\.spec\.ts/,
            use: { ...devices['Desktop Firefox'] },
          },
          {
            name: 'webkit',
            testMatch: /.*\.(smoke|cross)\.spec\.ts/,
            use: { ...devices['Desktop Safari'] },
          },
        ]
      : []),
  ],
  webServer: {
    command: `npm run e2e:prepare && npm run build && npx next start -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    timeout: 600_000,
    reuseExistingServer: !process.env.CI && process.env.E2E_REUSE_SERVER === '1',
    env: e2eServerEnv,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
