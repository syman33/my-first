import 'server-only'
import type { NextRequest, NextResponse } from 'next/server'
import { cookieNames, secureCookieAttributes } from '@/lib/auth/cookies'
import { generateToken, hashToken } from '@/lib/security/tokens'

/**
 * Anonymous shopper identity for guest carts and wishlists: a random token in
 * an httpOnly cookie, stored server-side only as an HMAC. Guests never see or
 * control database ids.
 */

export const GUEST_TTL_DAYS = 30

export interface GuestIdentity {
  token: string
  tokenHash: string
  isNew: boolean
}

export function readGuestTokenHash(req: NextRequest): string | null {
  const token = req.cookies.get(cookieNames.guest)?.value
  if (!token || !/^[A-Za-z0-9_-]{20,200}$/.test(token)) return null
  return hashToken(token)
}

/** Existing guest identity, or a new one (caller must persist it with `setGuestCookie`). */
export function guestIdentity(req: NextRequest): GuestIdentity {
  const token = req.cookies.get(cookieNames.guest)?.value
  if (token && /^[A-Za-z0-9_-]{20,200}$/.test(token))
    return { token, tokenHash: hashToken(token), isNew: false }
  const fresh = generateToken()
  return { token: fresh, tokenHash: hashToken(fresh), isNew: true }
}

export function setGuestCookie(response: NextResponse, token: string): void {
  response.cookies.set(
    cookieNames.guest,
    token,
    secureCookieAttributes({ maxAgeSeconds: GUEST_TTL_DAYS * 86_400 }),
  )
}

export function clearGuestCookie(response: NextResponse): void {
  response.cookies.set(cookieNames.guest, '', secureCookieAttributes({ maxAgeSeconds: 0 }))
}
