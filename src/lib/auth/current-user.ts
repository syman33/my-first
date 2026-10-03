import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import { cache } from 'react'
import type { Permission } from '@/generated/prisma/enums'
import type { Locale } from '@/i18n/config'
import { hashToken } from '@/lib/security/tokens'
import { validateSessionToken, type ValidatedSession } from '@/services/auth/session.service'
import { cookieNames } from './cookies'
import { hasPermission, isBackOfficeRole } from './permissions'

/**
 * Session access for Server Components and pages. Memoised per request, so
 * the header, page and nested components share a single lookup.
 */
export const getCurrentSession = cache(async (): Promise<ValidatedSession | null> => {
  const store = await cookies()
  return validateSessionToken(store.get(cookieNames.session)?.value)
})

/** HMAC of the guest token cookie (never the raw token), or null. */
export const getGuestTokenHash = cache(async (): Promise<string | null> => {
  const token = (await cookies()).get(cookieNames.guest)?.value
  return token && /^[A-Za-z0-9_-]{20,200}$/.test(token) ? hashToken(token) : null
})

export function loginPath(locale: Locale, returnTo: string): Route {
  return `/${locale}/login?next=${encodeURIComponent(returnTo)}` as Route
}

/** Require a signed-in user for a storefront page; otherwise redirect to login and come back. */
export async function requireUserPage(locale: Locale, returnTo: string): Promise<ValidatedSession> {
  const session = await getCurrentSession()
  if (!session) redirect(loginPath(locale, returnTo))
  return session
}

export type StaffPageAccess =
  { status: 'ok'; session: ValidatedSession } | { status: 'forbidden'; session: ValidatedSession }

/**
 * Require a back-office user. Anonymous visitors are sent to login;
 * customers and staff lacking `permission` get a 403 view.
 */
export async function requireStaffPage(
  locale: Locale,
  returnTo: string,
  permission?: Permission,
): Promise<StaffPageAccess> {
  const session = await getCurrentSession()
  if (!session) redirect(loginPath(locale, returnTo))
  if (!isBackOfficeRole(session.user.role)) return { status: 'forbidden', session }
  if (permission && !hasPermission(session.user, permission))
    return { status: 'forbidden', session }
  return { status: 'ok', session }
}
