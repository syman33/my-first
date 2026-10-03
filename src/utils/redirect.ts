/**
 * Validate a post-login redirect target. Only same-site relative paths are
 * accepted — never protocol-relative (`//evil.com`), absolute URLs,
 * backslash tricks or control characters — preventing open redirects.
 */
export function safeRedirectPath(target: string | null | undefined, fallback: string): string {
  if (!target || typeof target !== 'string') return fallback
  if (target.length > 500) return fallback
  if (!target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\'))
    return fallback
  if (/[\u0000-\u001f\\]/.test(target)) return fallback
  try {
    const url = new URL(target, 'http://velora.invalid')
    if (url.origin !== 'http://velora.invalid') return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}

const AUTH_PAGE = /^\/(?:ar|en)\/(?:login|register|forgot-password|reset-password)(?:[/?#]|$)/

/**
 * Where to send a user after signing in or registering: a validated
 * same-site path, never back to an authentication page (which would loop).
 */
export function postAuthRedirect(target: string | null | undefined, fallback: string): string {
  const path = safeRedirectPath(target, fallback)
  return AUTH_PAGE.test(path) ? fallback : path
}
