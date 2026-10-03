import { NextRequest } from 'next/server'

/**
 * Minimal browser-like client for invoking App Router route handlers directly:
 * JSON bodies, same-origin headers by default, and a cookie jar that applies
 * Set-Cookie responses to subsequent requests.
 */

export const TEST_ORIGIN = 'http://localhost:3000'

type RouteHandler<P> = (req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response>

export interface CallOptions<P> {
  method?: string
  path?: string
  body?: unknown
  rawBody?: string
  params?: P
  headers?: Record<string, string>
  /** Omit the Origin header (simulates a missing-origin / cross-site request). */
  noOrigin?: boolean
  origin?: string
}

export interface CallResult<T = unknown> {
  status: number
  body: T
  headers: Headers
  setCookies: string[]
}

export class TestClient {
  readonly cookies = new Map<string, string>()

  cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ')
  }

  setCookie(name: string, value: string): void {
    this.cookies.set(name, value)
  }

  async call<T = unknown, P = Record<string, never>>(
    handler: RouteHandler<P>,
    options: CallOptions<P> = {},
  ): Promise<CallResult<T>> {
    const method =
      options.method ??
      (options.body !== undefined || options.rawBody !== undefined ? 'POST' : 'GET')
    const headers = new Headers(options.headers)
    if (!options.noOrigin) headers.set('origin', options.origin ?? TEST_ORIGIN)
    if (options.body !== undefined || options.rawBody !== undefined) {
      if (!headers.has('content-type')) headers.set('content-type', 'application/json')
    }
    const cookie = this.cookieHeader()
    if (cookie) headers.set('cookie', cookie)
    const request = new NextRequest(`${TEST_ORIGIN}${options.path ?? '/api/test'}`, {
      method,
      headers,
      body:
        options.rawBody ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    })
    const response = await handler(request, {
      params: Promise.resolve((options.params ?? {}) as P),
    })
    const setCookies = response.headers.getSetCookie()
    for (const raw of setCookies) {
      const [pair, ...attributes] = raw.split(';')
      const [name, ...value] = (pair ?? '').split('=')
      if (!name) continue
      const maxAge = attributes.find((a) => a.trim().toLowerCase().startsWith('max-age='))
      if (maxAge && Number(maxAge.split('=')[1]) <= 0) this.cookies.delete(name.trim())
      else this.cookies.set(name.trim(), decodeURIComponent(value.join('=')))
    }
    const text = await response.text()
    let body: unknown = null
    try {
      body = text ? (JSON.parse(text) as unknown) : null
    } catch {
      body = text
    }
    return { status: response.status, body: body as T, headers: response.headers, setCookies }
  }
}

export interface ApiError {
  error: {
    code: string
    message: string
    fieldErrors?: Record<string, string>
    details?: Record<string, unknown>
  }
  requestId: string
}
