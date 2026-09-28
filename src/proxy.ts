import { type NextRequest, NextResponse } from 'next/server'
import { defaultLocale, isLocale, LOCALE_COOKIE } from '@/i18n/config'
import { cookieNames } from '@/lib/auth/cookies'
import { buildContentSecurityPolicy, generateNonce, toCspOrigin } from '@/lib/security/csp'
import { checkRequestOrigin, requestOrigin } from '@/lib/security/origin'

/**
 * Network-boundary logic that must run before rendering:
 *  1. CSRF: reject cross-site state-changing API calls (defence in depth — the
 *     API handler wrapper re-checks).
 *  2. Locale routing: prefix storefront URLs with the visitor's locale.
 *  3. Optimistic admin gate: bounce requests without a session cookie to login.
 *     This is only a UX shortcut; real authorization happens server-side in
 *     every admin page and API handler.
 *  4. Per-request CSP nonce for HTML documents.
 */

// Signed machine-to-machine endpoints: authenticated by HMAC signature / bearer secret, not cookies.
const CSRF_EXEMPT_PREFIXES = ['/api/webhooks/', '/api/cron/', '/api/health']

function withRequestId(request: NextRequest): { requestId: string; headers: Headers } {
  const incoming = request.headers.get('x-request-id')
  const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID()
  const headers = new Headers(request.headers)
  headers.set('x-request-id', requestId)
  return { requestId, headers }
}

function allowedOrigins(request: NextRequest): string[] {
  const trustProxy = process.env.TRUST_PROXY_HEADERS === 'true' || process.env.TRUST_PROXY_HEADERS === '1'
  const origins = new Set<string>([requestOrigin(request.url, request.headers, trustProxy)])
  const configured = toCspOrigin(process.env.NEXT_PUBLIC_APP_URL)
  if (configured) origins.add(configured)
  return [...origins]
}

function preferredLocale(request: NextRequest) {
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value
  return isLocale(cookie) ? cookie : defaultLocale
}

function analyticsOrigins(): string[] {
  if (process.env.ANALYTICS_PROVIDER !== 'ga4') return []
  return ['https://www.googletagmanager.com', 'https://www.google-analytics.com', 'https://*.google-analytics.com']
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const { requestId, headers } = withRequestId(request)

  // 1. API routes: CSRF origin verification, no HTML concerns.
  if (pathname.startsWith('/api/')) {
    if (!CSRF_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      const verdict = checkRequestOrigin({
        method: request.method,
        originHeader: request.headers.get('origin'),
        refererHeader: request.headers.get('referer'),
        allowedOrigins: allowedOrigins(request),
      })
      if (!verdict.ok) {
        return NextResponse.json(
          { error: { code: 'CSRF_REJECTED', message: 'Cross-site request rejected' }, requestId },
          { status: 403, headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } },
        )
      }
    }
    const response = NextResponse.next({ request: { headers } })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const firstSegment = pathname.split('/')[1] ?? ''
  const isAdmin = firstSegment === 'admin'

  // 2. Locale prefix for storefront routes.
  if (!isAdmin && !isLocale(firstSegment)) {
    const url = request.nextUrl.clone()
    url.pathname = `/${preferredLocale(request)}${pathname === '/' ? '' : pathname}`
    return NextResponse.redirect(url, 307)
  }

  // 3. Optimistic admin gate (authoritative checks live in the admin layout and API handlers).
  if (isAdmin && !request.cookies.has(cookieNames.session)) {
    const url = request.nextUrl.clone()
    url.pathname = `/${preferredLocale(request)}/login`
    url.search = `?next=${encodeURIComponent(pathname + search)}`
    return NextResponse.redirect(url, 307)
  }

  // 4. Nonce-based CSP for the document.
  const nonce = generateNonce()
  const imageOrigin = toCspOrigin(process.env.STORAGE_PUBLIC_BASE_URL)
  const csp = buildContentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV === 'development',
    imageOrigins: imageOrigin ? [imageOrigin] : [],
    analyticsOrigins: analyticsOrigins(),
    upgradeInsecureRequests: (process.env.NEXT_PUBLIC_APP_URL ?? '').startsWith('https://'),
  })
  headers.set('x-nonce', nonce)
  headers.set('content-security-policy', csp)
  headers.set('x-pathname', pathname + search)

  const response = NextResponse.next({ request: { headers } })
  response.headers.set('content-security-policy', csp)
  response.headers.set('x-request-id', requestId)
  return response
}

export const config = {
  matcher: [
    {
      source:
        '/((?!_next/static|_next/image|images/|uploads/|brand/|\\.well-known/|favicon\\.ico|icon|apple-icon|sitemap\\.xml|robots\\.txt|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|woff2?)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
