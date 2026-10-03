/**
 * Guard for destructive database operations (reset/truncate) used by test
 * tooling. Refuses to touch any database that is not explicitly a disposable
 * test database, so a mis-set DATABASE_URL can never wipe real data.
 */
export function assertDisposableDatabase(databaseUrl: string | undefined): string {
  if (!databaseUrl) throw new Error('DATABASE_URL is not set')
  let name: string
  let host: string
  try {
    const url = new URL(databaseUrl)
    name = decodeURIComponent(url.pathname.replace(/^\//, ''))
    host = url.hostname
  } catch {
    throw new Error('DATABASE_URL is not a valid URL')
  }
  if (!/_(test|e2e)$/.test(name)) {
    throw new Error(
      `Refusing to reset database "${name}": only databases ending in _test or _e2e may be reset by test tooling.`,
    )
  }
  if (process.env.APP_ENV === 'production' || process.env.APP_ENV === 'staging') {
    throw new Error(`Refusing to reset a database while APP_ENV=${process.env.APP_ENV}.`)
  }
  return `${host}/${name}`
}
