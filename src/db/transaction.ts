import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { logger } from '@/lib/logger'
import { prisma } from './client'
import { isRetryableTransactionError } from './errors'

/**
 * Run an interactive transaction, retrying it from the start after a
 * deadlock or serialization failure — both mean PostgreSQL rolled everything
 * back, so a clean retry is safe.
 */
export async function transactionWithRetry<T>(
  label: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn)
    } catch (error) {
      if (attempt < maxAttempts && isRetryableTransactionError(error)) {
        logger.warn('db.transaction_retry', { label, attempt })
        continue
      }
      throw error
    }
  }
}
