import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from '@/i18n/config'

/**
 * Helpers that derive request metadata from standard `Request` headers, so
 * they work identically in route handlers, proxy and tests.
 */

function trustProxy(): boolean {
  return process.env.TRUST_PROXY_HEADERS === 'true' || process.env.TRUST_PROXY_HEADERS === '1'
}

/**
 * Client IP. Forwarded headers are only trusted behind a known proxy
 * (TRUST_PROXY_HEADERS=true, e.g. on Vercel); otherwise a spoofed
 * X-Forwarded-For could be used to dodge rate limits.
 */
export function clientIp(headers: Headers): string {
  if (trustProxy()) {
    const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    if (forwarded) return forwarded.slice(0, 64)
    const real = headers.get('x-real-ip')?.trim()
    if (real) return real.slice(0, 64)
  }
  return 'unknown'
}

export function userAgent(headers: Headers): string | null {
  return headers.get('user-agent')?.slice(0, 512) ?? null
}

export function requestId(headers: Headers): string {
  const id = headers.get('x-request-id')
  return id && /^[\w-]{8,64}$/.test(id) ? id : crypto.randomUUID()
}

function cookieValue(headers: Headers, name: string): string | undefined {
  const cookie = headers.get('cookie')
  if (!cookie) return undefined
  for (const part of cookie.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return undefined
}

/**
 * Locale for API responses: explicit x-velora-locale header (sent by our
 * client), then the language cookie, then Accept-Language, then Arabic.
 */
export function requestLocale(headers: Headers): Locale {
  const explicit = headers.get('x-velora-locale')
  if (isLocale(explicit)) return explicit
  const cookie = cookieValue(headers, LOCALE_COOKIE)
  if (isLocale(cookie)) return cookie
  const accept = headers.get('accept-language')?.toLowerCase() ?? ''
  const ar = accept.indexOf('ar')
  const en = accept.indexOf('en')
  if (en >= 0 && (ar < 0 || en < ar)) return 'en'
  return defaultLocale
}
