/**
 * CSRF defence for cookie-authenticated, state-changing requests.
 *
 * Browsers attach an `Origin` header to cross-origin and same-origin
 * POST/PUT/PATCH/DELETE requests; a forged cross-site request carries the
 * attacker's origin, which never equals ours. Combined with `SameSite=Lax`
 * session cookies and JSON-only APIs, this blocks CSRF without per-form
 * tokens. When `Origin` is absent (very old browsers, some privacy tools) we
 * fall back to `Referer`; if both are absent the request is rejected.
 */

export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export interface OriginCheckInput {
  method: string
  originHeader: string | null
  refererHeader: string | null
  /** Origins considered first-party (configured app URL + the request's own origin). */
  allowedOrigins: readonly string[]
}

export type OriginCheckResult =
  { ok: true } | { ok: false; reason: 'missing-origin' | 'origin-mismatch' }

function originOf(value: string): string | null {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function checkRequestOrigin(input: OriginCheckInput): OriginCheckResult {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return { ok: true }
  const claimed =
    input.originHeader && input.originHeader !== 'null'
      ? originOf(input.originHeader)
      : input.refererHeader
        ? originOf(input.refererHeader)
        : null
  if (!claimed) return { ok: false, reason: 'missing-origin' }
  return input.allowedOrigins.includes(claimed)
    ? { ok: true }
    : { ok: false, reason: 'origin-mismatch' }
}

/**
 * The origin the request was addressed to, honouring X-Forwarded-* only when
 * the deployment sits behind a trusted proxy (Vercel, a load balancer).
 */
export function requestOrigin(url: string, headers: Headers, trustProxy: boolean): string {
  const parsed = new URL(url)
  if (!trustProxy) return parsed.origin
  const host = headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const proto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  if (host && (proto === 'https' || proto === 'http')) return `${proto}://${host}`
  return parsed.origin
}
