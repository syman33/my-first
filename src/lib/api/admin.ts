import 'server-only'
import { NotFoundError } from '@/lib/errors'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { uuidField } from '@/schemas/common'
import type { BaseContext } from './handler'

/** Rate limit shared by every back-office write (generous; stops runaway scripts). */
export function adminWriteLimit(ctx: BaseContext) {
  return [{ rule: RATE_LIMITS.adminWrite, subject: ctx.user?.id ?? ctx.ip }]
}

/** A route's `[id]` as a UUID, or a 404 (malformed ids are simply "not found"). */
export function routeId(raw: string | undefined, error: Error = new NotFoundError()): string {
  const parsed = uuidField.safeParse(raw)
  if (!parsed.success) throw error
  return parsed.data
}
