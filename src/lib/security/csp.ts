/**
 * Content-Security-Policy builder (pure; used by `src/proxy.ts`).
 *
 * Nonce-based strict CSP: only scripts carrying the per-request nonce (Next.js
 * attaches it to its own scripts automatically) or loaded by them
 * (`'strict-dynamic'`) may execute. Inline event handlers and injected
 * `<script>` tags are blocked.
 *
 * `style-src 'unsafe-inline'` is a deliberate trade-off: React/next/image emit
 * inline `style` attributes that cannot carry nonces. Style injection is far
 * less dangerous than script injection and is still restricted from loading
 * external stylesheets.
 */

export interface CspOptions {
  nonce: string
  isDev: boolean
  /** Extra image origins (e.g. object-storage CDN). */
  imageOrigins?: string[]
  /** Origins the browser may be sent to by form submission (hosted payment pages). */
  formActionOrigins?: string[]
  /** Extra script/connect origins for an enabled analytics provider. */
  analyticsOrigins?: string[]
  upgradeInsecureRequests?: boolean
}

export function buildContentSecurityPolicy(options: CspOptions): string {
  const { nonce, isDev } = options
  const img = ["'self'", 'data:', 'blob:', ...(options.imageOrigins ?? [])]
  const scripts = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(options.analyticsOrigins ?? []),
  ]
  if (isDev) scripts.push("'unsafe-eval'")
  const connect = ["'self'", ...(options.analyticsOrigins ?? [])]
  if (isDev) connect.push('ws:', 'wss:')

  const directives: string[] = [
    "default-src 'self'",
    `script-src ${scripts.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${img.join(' ')}`,
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${(options.formActionOrigins ?? []).join(' ')}`.trim(),
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ]
  if (options.upgradeInsecureRequests) directives.push('upgrade-insecure-requests')
  return directives.join('; ')
}

/** Cryptographically random, base64-encoded nonce (128 bits). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

/** Parse a URL-ish env value into a CSP source origin, ignoring invalid input. */
export function toCspOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    return new URL(value).origin
  } catch {
    return undefined
  }
}
