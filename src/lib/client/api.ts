/**
 * Browser-side client for VÉLORA's JSON API. Same-origin only (cookies are
 * httpOnly and sent automatically); the UI locale is passed so error
 * messages come back localised.
 */

export interface ApiErrorBody {
  code: string
  message: string
  fieldErrors?: Record<string, string>
  details?: Record<string, unknown>
}

export class ApiClientError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: Record<string, string>
  readonly details: Record<string, unknown>
  readonly requestId: string | undefined

  constructor(status: number, body: ApiErrorBody, requestId?: string) {
    super(body.message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = body.code
    this.fieldErrors = body.fieldErrors ?? {}
    this.details = body.details ?? {}
    this.requestId = requestId
  }
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  locale: 'ar' | 'en'
  signal?: AbortSignal
  headers?: Record<string, string>
}

const NETWORK_MESSAGE = {
  ar: 'تعذّر الاتصال. تحقق من اتصالك بالإنترنت ثم حاول مجدداً.',
  en: 'We could not connect. Check your internet connection and try again.',
} as const

export async function apiRequest<T>(path: string, options: ApiRequestOptions): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'x-velora-locale': options.locale,
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiClientError(0, { code: 'NETWORK_ERROR', message: NETWORK_MESSAGE[options.locale] })
  }

  if (response.status === 204) return undefined as T
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  if (!response.ok) {
    const body = (payload as { error?: ApiErrorBody; requestId?: string } | null) ?? {}
    throw new ApiClientError(
      response.status,
      body.error ?? { code: 'INTERNAL_ERROR', message: NETWORK_MESSAGE[options.locale] },
      body.requestId,
    )
  }
  return (payload as { data: T }).data
}
