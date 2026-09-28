import { execFileSync } from 'node:child_process'
import { assertDisposableDatabase } from '../db/safety'

/**
 * Prepares the E2E database: drop everything, apply every migration from
 * scratch (the same path production uses), then load the demo seed.
 */
const target = assertDisposableDatabase(process.env.DATABASE_URL)
console.log(`[e2e] resetting ${target}`)

const run = (args: string[]) =>
  execFileSync('npx', args, { stdio: 'inherit', env: { ...process.env, SEED_PROFILE: 'demo' } })

run(['prisma', 'migrate', 'reset', '--force'])
run(['prisma', 'generate'])
run(['prisma', 'db', 'seed'])
console.log('[e2e] database ready')
