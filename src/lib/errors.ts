/**
 * Typed application errors.
 *
 * Every error that may reach a client carries a stable machine-readable `code`
 * (localized into a human message at the API/UI boundary) and an HTTP status.
 * Anything that is not an `AppError` is treated as an unexpected internal
 * failure: it is logged with full detail and answered with a generic 500 —
 * raw database/driver errors are never exposed to customers.
 */

export const ERROR_CODES = [
  // generic
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
  'CSRF_REJECTED',
  // auth
  'INVALID_CREDENTIALS',
  'ACCOUNT_DISABLED',
  'EMAIL_ALREADY_REGISTERED',
  'INVALID_OR_EXPIRED_TOKEN',
  'SESSION_EXPIRED',
  'CURRENT_PASSWORD_INCORRECT',
  'EMAIL_NOT_VERIFIED',
  // catalog / cart
  'PRODUCT_NOT_FOUND',
  'VARIANT_NOT_FOUND',
  'PRODUCT_UNAVAILABLE',
  'INSUFFICIENT_STOCK',
  'QUANTITY_LIMIT_EXCEEDED',
  'CART_EMPTY',
  'CART_CHANGED',
  'INVALID_COUPON',
  // orders / checkout
  'ADDRESS_NOT_FOUND',
  'ORDER_NOT_FOUND',
  'ORDER_CREATION_FAILED',
  'INVALID_ORDER_TRANSITION',
  'ORDER_NOT_CANCELLABLE',
  'PAYMENT_METHOD_UNAVAILABLE',
  'SHIPPING_METHOD_UNAVAILABLE',
  'IDEMPOTENCY_CONFLICT',
  'IDEMPOTENCY_IN_PROGRESS',
  // payments
  'PAYMENT_FAILED',
  'PAYMENT_NOT_FOUND',
  'PAYMENT_ALREADY_COMPLETED',
  'WEBHOOK_SIGNATURE_INVALID',
  'WEBHOOK_REJECTED',
  'REFUND_NOT_ALLOWED',
  'PROVIDER_NOT_CONFIGURED',
  'PROVIDER_ERROR',
  // other domain
  'REVIEW_NOT_ALLOWED',
  'RETURN_NOT_ALLOWED',
  'UPLOAD_REJECTED',
  'IMPORT_INVALID',
  'SLUG_TAKEN',
  'SKU_TAKEN',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export interface AppErrorOptions {
  status?: number
  details?: Record<string, unknown>
  fieldErrors?: Record<string, string>
  cause?: unknown
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  /** Safe, non-sensitive structured context that may be returned to the client. */
  readonly details: Record<string, unknown> | undefined
  /** Field → message-key map for form validation errors. */
  readonly fieldErrors: Record<string, string> | undefined

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = new.target.name
    this.code = code
    this.status = options.status ?? 500
    this.details = options.details
    this.fieldErrors = options.fieldErrors
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Malformed request', options: AppErrorOptions = {}) {
    super('BAD_REQUEST', message, { status: 400, ...options })
  }
}

export class ValidationError extends AppError {
  constructor(fieldErrors: Record<string, string>, message = 'Validation failed') {
    super('VALIDATION_ERROR', message, { status: 422, fieldErrors })
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', code: ErrorCode = 'UNAUTHORIZED') {
    super(code, message, { status: 401 })
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = 'You do not have permission to perform this action',
    code: ErrorCode = 'FORBIDDEN',
  ) {
    super(code, message, { status: 403 })
  }
}

export class NotFoundError extends AppError {
  constructor(
    code: ErrorCode = 'NOT_FOUND',
    message = 'Resource not found',
    details?: Record<string, unknown>,
  ) {
    super(code, message, { status: 404, details })
  }
}

export class ConflictError extends AppError {
  constructor(
    code: ErrorCode = 'CONFLICT',
    message = 'Conflict',
    details?: Record<string, unknown>,
  ) {
    super(code, message, { status: 409, details })
  }
}

export class RateLimitedError extends AppError {
  readonly retryAfterSeconds: number
  constructor(retryAfterSeconds: number) {
    super('RATE_LIMITED', 'Too many requests', { status: 429, details: { retryAfterSeconds } })
    this.retryAfterSeconds = retryAfterSeconds
  }
}

// ---- Domain errors -------------------------------------------------------

export class ProductNotFoundError extends NotFoundError {
  constructor(details?: Record<string, unknown>) {
    super('PRODUCT_NOT_FOUND', 'Product not found', details)
  }
}

export class OrderNotFoundError extends NotFoundError {
  constructor() {
    super('ORDER_NOT_FOUND', 'Order not found')
  }
}

export interface StockShortage {
  variantId: string
  sku: string
  requested: number
  available: number
}

export class InsufficientStockError extends AppError {
  readonly shortages: StockShortage[]
  constructor(shortages: StockShortage[]) {
    super('INSUFFICIENT_STOCK', 'Insufficient stock', {
      status: 409,
      details: {
        items: shortages.map((s) => ({
          variantId: s.variantId,
          sku: s.sku,
          available: s.available,
        })),
      },
    })
    this.shortages = shortages
  }
}

export const COUPON_FAILURE_REASONS = [
  'NOT_FOUND',
  'INACTIVE',
  'NOT_STARTED',
  'EXPIRED',
  'USAGE_LIMIT_REACHED',
  'USER_LIMIT_REACHED',
  'MIN_ORDER_NOT_MET',
  'NOT_APPLICABLE',
  'LOGIN_REQUIRED',
] as const
export type CouponFailureReason = (typeof COUPON_FAILURE_REASONS)[number]

export class InvalidCouponError extends AppError {
  readonly reason: CouponFailureReason
  constructor(reason: CouponFailureReason, details: Record<string, unknown> = {}) {
    super('INVALID_COUPON', `Coupon rejected: ${reason}`, {
      status: 422,
      details: { reason, ...details },
    })
    this.reason = reason
  }
}

export class InvalidOrderTransitionError extends AppError {
  constructor(from: string, to: string) {
    super('INVALID_ORDER_TRANSITION', `Order cannot move from ${from} to ${to}`, {
      status: 409,
      details: { from, to },
    })
  }
}

export class PaymentFailedError extends AppError {
  constructor(message = 'Payment failed', details?: Record<string, unknown>) {
    super('PAYMENT_FAILED', message, { status: 402, details })
  }
}

export class OrderCreationError extends AppError {
  constructor(message = 'Order could not be created', cause?: unknown) {
    super('ORDER_CREATION_FAILED', message, { status: 500, cause })
  }
}

export class ProviderNotConfiguredError extends AppError {
  constructor(provider: string, missing: string[]) {
    super('PROVIDER_NOT_CONFIGURED', `${provider} is not configured`, {
      status: 503,
      details: { provider, missing },
    })
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
