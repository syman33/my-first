import { spawnSync } from 'node:child_process'

/**
 * Fails when prisma/schema.prisma and the committed migrations disagree
 * (someone changed the schema without generating a migration, or edited a
 * migration by hand). Replays migrations into a disposable shadow database.
 */
const shadow = process.env.SHADOW_DATABASE_URL ?? 'postgresql://velora:velora_dev_password@localhost:5432/velora_shadow'
const result = spawnSync(
  'npx',
  ['prisma', 'migrate', 'diff', '--from-migrations', 'prisma/migrations', '--to-schema', 'prisma/schema.prisma', '--exit-code'],
  { encoding: 'utf8', env: { ...process.env, SHADOW_DATABASE_URL: shadow } },
)
const output = `${result.stdout}${result.stderr}`
if (result.status === 0) {
  console.log('✓ Migrations are in sync with prisma/schema.prisma')
} else if (result.status === 2) {
  console.error(`✗ Schema drift detected — create a migration with \`npm run db:migrate\`:\n${output}`)
  process.exit(2)
} else {
  console.error(`✗ Could not verify migrations:\n${output}`)
  process.exit(1)
}
