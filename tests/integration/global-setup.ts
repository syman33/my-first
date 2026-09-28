import { execFileSync } from 'node:child_process'
import { assertDisposableDatabase } from '../../scripts/db/safety'
import { integrationDatabaseUrl, sharedTestEnv } from '../support/test-env'

/**
 * Once per integration run: bring the disposable test database up to date by
 * applying committed migrations with `prisma migrate deploy` — the same
 * non-destructive command production deployments use. Per-test isolation is
 * handled by guarded truncation in `helpers/db.ts`.
 */
export default function globalSetup(): void {
  assertDisposableDatabase(integrationDatabaseUrl)
  try {
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      stdio: 'pipe',
      env: { ...process.env, ...sharedTestEnv, DATABASE_URL: integrationDatabaseUrl },
    })
  } catch (error) {
    const output = error as { stdout?: Buffer; stderr?: Buffer }
    throw new Error(
      `Failed to migrate the integration test database:\n${output.stdout?.toString() ?? ''}\n${output.stderr?.toString() ?? ''}`,
    )
  }
}
