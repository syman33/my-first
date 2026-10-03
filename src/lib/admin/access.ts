import 'server-only'
import { cookies } from 'next/headers'
import { cache } from 'react'
import type { Permission } from '@/generated/prisma/enums'
import { type Dictionary, getDictionary } from '@/i18n'
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from '@/i18n/config'
import { requireStaffPage } from '@/lib/auth/current-user'
import type { ValidatedSession } from '@/services/auth/session.service'

/** The back office follows the visitor's language preference (the storefront locale cookie). */
export const getAdminLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : defaultLocale
})

export type AdminAccess =
  | { status: 'ok'; session: ValidatedSession; locale: Locale; dict: Dictionary }
  | { status: 'forbidden'; locale: Locale; dict: Dictionary; isCustomer: boolean }

/**
 * Authorise an admin page. Anonymous visitors are redirected to login (and
 * back); customers and staff without `permission` get the 403 view. Every
 * admin page calls this itself — layouts are not a security boundary.
 */
export async function adminAccess(permission: Permission, returnTo: string): Promise<AdminAccess> {
  const locale = await getAdminLocale()
  const dict = getDictionary(locale)
  const access = await requireStaffPage(locale, returnTo, permission)
  if (access.status === 'forbidden') {
    return {
      status: 'forbidden',
      locale,
      dict,
      isCustomer: access.session.user.role === 'CUSTOMER',
    }
  }
  return { status: 'ok', session: access.session, locale, dict }
}
