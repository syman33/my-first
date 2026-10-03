import 'server-only'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import type { Locale } from '@/i18n/config'
import { getDictionary, interpolate } from '@/i18n'
import { type AppError, type ErrorCode, isAppError, RateLimitedError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { captureException } from '@/lib/monitoring'
import { formatMoney } from '@/i18n/format'

/**
 * Consistent JSON envelopes:
 *   success: { data: T }
 *   failure: { error: { code, message, fieldErrors?, details? }, requestId }
 * Messages are localised; stack traces and raw database errors never leave the server.
 */

export function ok<T>(
  data: T,
  init: { status?: number; headers?: HeadersInit } = {},
): NextResponse {
  return NextResponse.json(
    { data },
    { status: init.status ?? 200, headers: { 'cache-control': 'no-store', ...init.headers } },
  )
}

export function created<T>(data: T, headers?: HeadersInit): NextResponse {
  return ok(data, { status: 201, headers })
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } })
}

type FieldKey = keyof ReturnType<typeof getDictionary>['errors']['fields']

export function localizeFieldError(locale: Locale, key: string): string {
  const fields = getDictionary(locale).errors.fields
  return (fields as Record<string, string>)[key] ?? fields.invalid
}

export function zodFieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root'
    if (out[path]) continue
    const known = issue.message in getDictionary('en').errors.fields
    out[path] = known ? issue.message : 'invalid'
  }
  return out
}

function localizedMessage(error: AppError, locale: Locale): string {
  const dict = getDictionary(locale)
  if (error.code === 'INVALID_COUPON') {
    const reason = String(error.details?.reason ?? '')
    const template = (dict.errors.coupon as Record<string, string>)[reason]
    if (template) {
      const minimum = error.details?.minOrderAmount
      return interpolate(template, {
        amount: typeof minimum === 'number' ? formatMoney(minimum, locale) : '',
      })
    }
  }
  return dict.errors.codes[error.code as ErrorCode] ?? dict.errors.generic
}

export function errorResponse(
  error: unknown,
  locale: Locale,
  requestId: string,
  context: Record<string, unknown> = {},
): NextResponse {
  if (error instanceof ZodError) {
    const fieldErrors = zodFieldErrors(error)
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: getDictionary(locale).errors.codes.VALIDATION_ERROR,
          fieldErrors: Object.fromEntries(
            Object.entries(fieldErrors).map(([k, v]) => [k, localizeFieldError(locale, v)]),
          ),
        },
        requestId,
      },
      { status: 422, headers: { 'cache-control': 'no-store' } },
    )
  }

  if (isAppError(error)) {
    if (error.status >= 500)
      logger.error('api.app_error', { requestId, code: error.code, error, ...context })
    const headers: Record<string, string> = { 'cache-control': 'no-store' }
    if (error instanceof RateLimitedError) headers['retry-after'] = String(error.retryAfterSeconds)
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: localizedMessage(error, locale),
          ...(error.fieldErrors
            ? {
                fieldErrors: Object.fromEntries(
                  Object.entries(error.fieldErrors).map(([k, v]) => [
                    k,
                    localizeFieldError(locale, v as FieldKey),
                  ]),
                ),
              }
            : {}),
          ...(error.details ? { details: error.details } : {}),
        },
        requestId,
      },
      { status: error.status, headers },
    )
  }

  logger.error('api.unhandled_error', { requestId, error, ...context })
  void captureException(error, { requestId, ...context })
  return NextResponse.json(
    {
      error: { code: 'INTERNAL_ERROR', message: getDictionary(locale).errors.codes.INTERNAL_ERROR },
      requestId,
    },
    { status: 500, headers: { 'cache-control': 'no-store' } },
  )
}
