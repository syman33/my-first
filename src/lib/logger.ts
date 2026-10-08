/**
 * Structured logger.
 *
 * - JSON lines in production (machine-parseable by any log drain), compact
 *   human-readable lines in development.
 * - Recursive redaction of secrets and sensitive personal data. Passwords,
 *   tokens, cookies, card data and credentials never reach a log sink.
 * - This file is the only sanctioned place that writes to the console.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export type LogContext = Record<string, unknown>

const REDACTED = '[REDACTED]'

/** Keys (case-insensitive, substring match) whose values are always removed. */
const SENSITIVE_KEY_PATTERNS = [
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'cookie',
  'set-cookie',
  'apikey',
  'api_key',
  'privatekey',
  'cardnumber',
  'card_number',
  'pan',
  'cvv',
  'cvc',
  'signature',
  'otp',
  'hash',
]

/** Keys whose values are personal data: masked rather than dropped so logs stay useful. */
const PII_KEYS = new Set(['email', 'phone', 'recipient'])

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase()
  if (k === 'pan') return true
  return SENSITIVE_KEY_PATTERNS.some((p) => p !== 'pan' && k.includes(p))
}

export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return '***'
  return `${email.slice(0, 1)}***${email.slice(at)}`
}

function maskPii(key: string, value: unknown): unknown {
  if (typeof value !== 'string') return value
  if (key.toLowerCase() === 'email' || value.includes('@')) return maskEmail(value)
  return value.length > 4 ? `***${value.slice(-4)}` : '***'
}

export function serializeError(error: unknown, includeStack: boolean): Record<string, unknown> {
  if (error instanceof Error) {
    const out: Record<string, unknown> = { name: error.name, message: error.message }
    const code = (error as { code?: unknown }).code
    if (code !== undefined) out.code = code
    if (includeStack && error.stack) out.stack = error.stack
    if (error.cause !== undefined) out.cause = serializeError(error.cause, includeStack)
    return out
  }
  return { message: String(error) }
}

/** Secret parameters inside links (password reset, verification, unsubscribe…). */
const LINK_SECRET = /([?#&](?:token|t|sig|signature|key|code)=)[^&\s#"'<>]+/gi

/** Remove secret values from links in free text (e.g. an email body), keeping the rest readable. */
export function redactLinkSecrets(text: string): string {
  return text.replace(LINK_SECRET, '$1[REDACTED]')
}

export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 8) return '[Truncated]'
  // Strings may embed links with tokens even under harmless keys.
  if (typeof value === 'string') return redactLinkSecrets(value)
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) return redact(serializeError(value, true), depth + 1, seen)
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1, seen))
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) out[key] = REDACTED
    else if (PII_KEYS.has(key.toLowerCase())) out[key] = maskPii(key, v)
    else out[key] = redact(v, depth + 1, seen)
  }
  return out
}

function configuredLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

export interface Logger {
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
  child(bindings: LogContext): Logger
}

function createLogger(bindings: LogContext): Logger {
  const write = (level: LogLevel, message: string, context?: LogContext): void => {
    if (process.env.VELORA_SILENT_LOGS === 'true') return
    if (LEVEL_ORDER[level] < LEVEL_ORDER[configuredLevel()]) return
    const isProd = process.env.NODE_ENV === 'production'
    const payload = redact({ ...bindings, ...context }) as Record<string, unknown>
    const entry = { level, time: new Date().toISOString(), msg: message, ...payload }
    const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
    if (isProd) {
      sink(JSON.stringify(entry))
    } else {
      const extra = Object.keys(payload).length > 0 ? ` ${JSON.stringify(payload)}` : ''
      sink(`[${level.toUpperCase()}] ${message}${extra}`)
    }
  }
  return {
    debug: (m, c) => write('debug', m, c),
    info: (m, c) => write('info', m, c),
    warn: (m, c) => write('warn', m, c),
    error: (m, c) => write('error', m, c),
    child: (more) => createLogger({ ...bindings, ...more }),
  }
}

export const logger: Logger = createLogger({ service: 'velora' })
