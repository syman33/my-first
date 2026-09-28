import { afterAll, beforeEach } from 'vitest'
import { prisma } from '@/db/client'
import { resetDatabase } from './helpers/db'

// Every test starts from an empty database; tests create exactly the data they need.
beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})
