import { Prisma } from '@/generated/prisma/client'

/**
 * Helpers to classify database errors without leaking driver specifics into
 * services. Prisma 7 driver-adapter errors carry the original PostgreSQL
 * SQLSTATE under `meta.driverAdapterError.cause`.
 */

interface AdapterCause {
  originalCode?: string
  kind?: string
  constraint?: { index?: string; fields?: string[] }
}

function adapterCause(error: Prisma.PrismaClientKnownRequestError): AdapterCause | undefined {
  const meta = error.meta as { driverAdapterError?: { cause?: AdapterCause } } | undefined
  return meta?.driverAdapterError?.cause
}

function sqlState(error: unknown): string | undefined {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return undefined
  const cause = adapterCause(error)
  if (cause?.originalCode) return cause.originalCode
  const match = /Code: `(\w{5})`/.exec(error.message)
  return match?.[1]
}

/** Unique violation (P2002 / SQLSTATE 23505), optionally for a specific constraint/index name. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (error.code !== 'P2002' && sqlState(error) !== '23505') return false
  if (!constraint) return true
  const cause = adapterCause(error)
  const target = (error.meta as { target?: unknown } | undefined)?.target
  return (
    cause?.constraint?.index === constraint ||
    (Array.isArray(target) && target.includes(constraint)) ||
    target === constraint ||
    error.message.includes(constraint)
  )
}

/** CHECK constraint violation (SQLSTATE 23514). */
export function isCheckViolation(error: unknown, constraint?: string): boolean {
  if (sqlState(error) !== '23514') return false
  return constraint ? error instanceof Error && error.message.includes(constraint) : true
}

/** Foreign key violation (P2003 / SQLSTATE 23503). */
export function isForeignKeyViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2003' || sqlState(error) === '23503')
  )
}

/** Record required by an update/delete was not found (P2025). */
export function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
}

/** Serialization failure or deadlock: safe to retry the whole transaction. */
export function isRetryableTransactionError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (error.code === 'P2034') return true
  const state = sqlState(error)
  return state === '40001' || state === '40P01'
}
