import 'server-only'
import type { Permission } from '@/generated/prisma/enums'
import { hasPermission } from '@/lib/auth/permissions'
import { ForbiddenError, NotFoundError } from '@/lib/errors'
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

/** For routes guarded by one permission that also touch another area (e.g. importing products). */
export function requireAlso(
  user: { id: string; role: 'CUSTOMER' | 'STAFF' | 'ADMIN'; permissions: readonly Permission[] },
  ...permissions: Permission[]
): void {
  if (!permissions.every((permission) => hasPermission(user, permission))) {
    throw new ForbiddenError('Missing permission')
  }
}
