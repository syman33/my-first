/**
 * Cookie names and attributes shared by the proxy, route handlers and server
 * components. Kept dependency-free so `src/proxy.ts` can import it cheaply.
 *
 * When the app is served over HTTPS (always in production — enforced by env
 * validation) cookies are `Secure` and use the `__Host-` prefix, which the
 * browser only accepts for Secure, host-only, Path=/ cookies: they cannot be
 * set or overwritten by a subdomain or over plain HTTP.
 */

export function cookiesAreSecure(): boolean {
  return (process.env.NEXT_PUBLIC_APP_URL ?? '').startsWith('https://')
}

function name(base: string): string {
  return cookiesAreSecure() ? `__Host-${base}` : base
}

export const cookieNames = {
  get session(): string {
    return name('velora_session')
  },
  /** Opaque token identifying a guest's server-side cart and wishlist. */
  get guest(): string {
    return name('velora_guest')
  },
} as const

export interface CookieAttributes {
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax' | 'strict'
  path: '/'
  maxAge?: number
  expires?: Date
}

/** Attributes for authentication/guest cookies: never readable by JavaScript. */
export function secureCookieAttributes(
  options: { maxAgeSeconds?: number; expires?: Date } = {},
): CookieAttributes {
  return {
    httpOnly: true,
    secure: cookiesAreSecure(),
    sameSite: 'lax',
    path: '/',
    ...(options.maxAgeSeconds !== undefined ? { maxAge: options.maxAgeSeconds } : {}),
    ...(options.expires ? { expires: options.expires } : {}),
  }
}
