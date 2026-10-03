import 'server-only'
import type { NextResponse } from 'next/server'
import { cookieNames, secureCookieAttributes } from './cookies'

/** Attach a fresh session cookie (httpOnly, SameSite=Lax, Secure + __Host- on HTTPS). */
export function setSessionCookie(
  response: NextResponse,
  token: string,
  maxAgeSeconds: number,
): void {
  response.cookies.set(cookieNames.session, token, secureCookieAttributes({ maxAgeSeconds }))
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(cookieNames.session, '', secureCookieAttributes({ maxAgeSeconds: 0 }))
}
