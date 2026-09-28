import { loadEnvConfig } from '@next/env'
import { defineConfig } from 'prisma/config'

// Load .env / .env.local / .env.[mode] the same way Next.js does, so the CLI,
// seed scripts and the app always agree on which database they talk to.
loadEnvConfig(process.cwd())

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/index.ts',
  },
  datasource: {
    // Placeholder keeps `prisma generate` working in environments without a DB
    // (e.g. CI install step); commands that touch the DB fail loudly instead.
    url: process.env.DATABASE_URL ?? 'postgresql://invalid:invalid@localhost:5432/invalid',
  },
})
