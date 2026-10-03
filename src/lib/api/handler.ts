import 'server-only'
import { after, type NextRequest, type NextResponse } from 'next/server'
import type { z } from 'zod'
import type { Permission } from '@/generated/prisma/enums'
import type { Locale } from '@/i18n/config'
import { cookieNames } from '@/lib/auth/cookies'
import { hasPermission, isBackOfficeRole } from '@/lib/auth/permissions'
import { AppError, BadRequestError, ForbiddenError, UnauthorizedError } from '@/lib/errors'
import {
  clientIp,
  requestId as readRequestId,
  requestLocale,
  userAgent,
} from '@/lib/http/request-context'
import { logger } from '@/lib/logger'
import { enforceRateLimits, type RateLimitRule } from '@/lib/rate-limit'
import { checkRequestOrigin, requestOrigin } from '@/lib/security/origin'
import { actorFromRole, type AuditContext, SYSTEM_ACTOR } from '@/services/audit/audit.service'
import {
  type SessionUser,
  validateSessionToken,
  type ValidatedSession,
} from '@/services/auth/session.service'
import { errorResponse } from './responses'

/**
 * Every route handler goes through `apiHandler`, which enforces — in one
 * reviewed place — CSRF origin checks, session resolution, authentication,
 * permission checks, rate limits, body limits, validation and error mapping.
 */

type AuthMode = 'public' | 'optional' | 'user' | 'staff'

export interface HandlerOptions {
  /** public: no session lookup. optional: session if present. user: login required. staff: back-office user required. */
  auth: AuthMode
  /** Back-office permission required (implies auth: 'staff'). */
  permission?: Permission
  /** Rate-limit rules, evaluated after authentication so user-scoped subjects are available. */
  rateLimit?: (ctx: BaseContext) => Array<{ rule: RateLimitRule; subject: string }>
  /** Maximum accepted JSON body size in bytes (default 64 KiB). */
  maxBodyBytes?: number
  /** Skip the CSRF origin check (only for signature-authenticated machine endpoints). */
  skipCsrf?: boolean
}

export interface BaseContext {
  req: NextRequest
  requestId: string
  ip: string
  userAgent: string | null
  locale: Locale
  sessionToken: string | null
  session: ValidatedSession | null
  user: SessionUser | null
  audit: AuditContext
  /** Parse and validate the JSON body (415/400/413/422 on failure). */
  body<S extends z.ZodType>(schema: S): Promise<z.output<S>>
  /** Validate URL search params. */
  query<S extends z.ZodType>(schema: S): z.output<S>
  /** Run work after the response is sent (e.g. outbox processing). */
  afterResponse(task: () => Promise<unknown>): void
}

export interface AuthedContext extends BaseContext {
  session: ValidatedSession
  user: SessionUser
}

type Handler<P, C> = (ctx: C & { params: P }) => Promise<NextResponse | Response>

const DEFAULT_MAX_BODY = 64 * 1024

function trustProxy(): boolean {
  return process.env.TRUST_PROXY_HEADERS === 'true' || process.env.TRUST_PROXY_HEADERS === '1'
}

function allowedOrigins(req: NextRequest): string[] {
  const origins = new Set([requestOrigin(req.url, req.headers, trustProxy())])
  try {
    if (process.env.NEXT_PUBLIC_APP_URL)
      origins.add(new URL(process.env.NEXT_PUBLIC_APP_URL).origin)
  } catch {
    logger.warn('api.invalid_app_url')
  }
  return [...origins]
}

async function readJson(req: NextRequest, maxBytes: number): Promise<unknown> {
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Expected application/json', { status: 415 })
  }
  const declared = Number(req.headers.get('content-length') ?? '0')
  if (declared > maxBytes)
    throw new AppError('PAYLOAD_TOO_LARGE', 'Request body too large', { status: 413 })
  const text = await req.text()
  if (Buffer.byteLength(text, 'utf8') > maxBytes)
    throw new AppError('PAYLOAD_TOO_LARGE', 'Request body too large', { status: 413 })
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new BadRequestError('Malformed JSON body')
  }
}

export function apiHandler<P = Record<string, never>>(
  options: HandlerOptions & { auth: 'user' | 'staff' },
  handler: Handler<P, AuthedContext>,
): (req: NextRequest, routeContext: { params: Promise<P> }) => Promise<Response>
export function apiHandler<P = Record<string, never>>(
  options: HandlerOptions & { auth: 'public' | 'optional' },
  handler: Handler<P, BaseContext>,
): (req: NextRequest, routeContext: { params: Promise<P> }) => Promise<Response>
export function apiHandler<P>(
  options: HandlerOptions,
  handler: Handler<P, AuthedContext> | Handler<P, BaseContext>,
) {
  return async (req: NextRequest, routeContext: { params: Promise<P> }): Promise<Response> => {
    const requestId = readRequestId(req.headers)
    const locale = requestLocale(req.headers)
    const ip = clientIp(req.headers)
    try {
      if (!options.skipCsrf) {
        const verdict = checkRequestOrigin({
          method: req.method,
          originHeader: req.headers.get('origin'),
          refererHeader: req.headers.get('referer'),
          allowedOrigins: allowedOrigins(req),
        })
        if (!verdict.ok)
          throw new AppError('CSRF_REJECTED', 'Cross-site request rejected', { status: 403 })
      }

      const sessionToken = req.cookies.get(cookieNames.session)?.value ?? null
      const session = options.auth === 'public' ? null : await validateSessionToken(sessionToken)
      const user = session?.user ?? null
      const requiresStaff = options.auth === 'staff' || options.permission !== undefined
      if ((options.auth === 'user' || requiresStaff) && !user) throw new UnauthorizedError()
      if (requiresStaff && user && !isBackOfficeRole(user.role)) throw new ForbiddenError()
      if (options.permission && !hasPermission(user, options.permission)) throw new ForbiddenError()

      let bodyRead = false
      const ctx: BaseContext = {
        req,
        requestId,
        ip,
        userAgent: userAgent(req.headers),
        locale,
        sessionToken,
        session,
        user,
        audit: {
          actor: user ? actorFromRole(user.id, user.role) : SYSTEM_ACTOR,
          ipAddress: ip,
          requestId,
        },
        async body(schema) {
          if (bodyRead) throw new Error('Request body already consumed')
          bodyRead = true
          const raw = await readJson(req, options.maxBodyBytes ?? DEFAULT_MAX_BODY)
          return schema.parse(raw)
        },
        query(schema) {
          return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()))
        },
        afterResponse(task) {
          try {
            after(async () => {
              try {
                await task()
              } catch (error) {
                logger.error('api.after_response_failed', { requestId, error })
              }
            })
          } catch (error) {
            // Outside a Next.js request scope (e.g. unit/integration tests): the
            // background job/cron will perform the work instead.
            logger.debug('api.after_unavailable', {
              requestId,
              reason: error instanceof Error ? error.message : String(error),
            })
          }
        },
      }

      if (options.rateLimit) await enforceRateLimits(options.rateLimit(ctx))

      const params = await routeContext.params
      // Safe: for 'user'/'staff' routes the checks above guarantee `user` and `session` are set.
      const response = await (handler as Handler<P, BaseContext>)({ ...ctx, params })
      response.headers.set('x-request-id', requestId)
      return response
    } catch (error) {
      const response = errorResponse(error, locale, requestId, {
        method: req.method,
        path: req.nextUrl.pathname,
      })
      response.headers.set('x-request-id', requestId)
      return response
    }
  }
}
