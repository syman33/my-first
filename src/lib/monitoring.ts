import { logger, redact } from '@/lib/logger'

/**
 * Error-tracking abstraction. By default errors go to the structured log
 * (which any log drain can alert on). An external tracker (Sentry, Datadog,
 * etc.) can be attached at startup with `registerErrorReporter` without
 * touching call sites. Context is redacted before it leaves the process.
 */

export type ErrorContext = Record<string, unknown>
export type ErrorReporter = (error: unknown, context: ErrorContext) => Promise<void> | void

let reporter: ErrorReporter | null = null

export function registerErrorReporter(next: ErrorReporter | null): void {
  reporter = next
}

export async function captureException(error: unknown, context: ErrorContext = {}): Promise<void> {
  if (!reporter) return
  try {
    await reporter(error, redact(context) as ErrorContext)
  } catch (reportError) {
    logger.warn('monitoring.report_failed', { error: reportError })
  }
}

/**
 * Operational signals worth alerting on. Emitted as structured log events with
 * a stable `alert` field so dashboards/alerts can match on it.
 */
export type OperationalAlert =
  | 'payment.failed'
  | 'payment.webhook_rejected'
  | 'payment.webhook_processing_failed'
  | 'payment.amount_mismatch'
  | 'payment.paid_after_cancellation'
  | 'order.creation_failed'
  | 'refund.failed'
  | 'shipment.creation_failed'
  | 'notification.delivery_failed'
  | 'outbox.event_dead_lettered'
  | 'inventory.reservation_release_failed'

export function emitAlert(alert: OperationalAlert, context: ErrorContext = {}): void {
  logger.warn(`alert.${alert}`, { alert, ...context })
}
