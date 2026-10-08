import { type NextRequest, NextResponse } from 'next/server'
import { runAfterResponse } from '@/lib/api/handler'
import { isAppError } from '@/lib/errors'
import { clientIp } from '@/lib/http/request-context'
import { logger } from '@/lib/logger'
import { emitAlert } from '@/lib/monitoring'
import { enforceRateLimits, RATE_LIMITS } from '@/lib/rate-limit'
import { processPendingEvents } from '@/services/events/process'
import { handlePaymentWebhook } from '@/services/payments/payment.service'
import { isProviderName } from '@/services/payments/registry'

const MAX_BODY_BYTES = 256 * 1024

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

/**
 * Payment provider webhooks. Not cookie-authenticated (CSRF-exempt):
 * authenticity comes from the provider signature, checked before anything
 * is read or written. Responses are minimal and never echo details.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params
  if (!isProviderName(provider)) return json({ error: { code: 'NOT_FOUND' } }, 404)
  try {
    await enforceRateLimits([
      { rule: RATE_LIMITS.webhook, subject: `${provider}:${clientIp(req.headers)}` },
    ])
  } catch {
    return json({ error: { code: 'RATE_LIMITED' } }, 429)
  }
  // Refuse oversized bodies before reading them; re-check after (chunked bodies declare no length).
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES)
    return json({ error: { code: 'PAYLOAD_TOO_LARGE' } }, 413)
  const raw = await req.text()
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES)
    return json({ error: { code: 'PAYLOAD_TOO_LARGE' } }, 413)

  try {
    const result = await handlePaymentWebhook(provider, raw, req.headers)
    if (result.status === 'processed') runAfterResponse(() => processPendingEvents())
    return json({ received: true, status: result.status })
  } catch (error) {
    if (isAppError(error) && error.code === 'WEBHOOK_SIGNATURE_INVALID') {
      emitAlert('payment.webhook_rejected', { provider })
      return json({ error: { code: 'WEBHOOK_SIGNATURE_INVALID' } }, 401)
    }
    logger.error('payments.webhook_failed', { provider, error })
    emitAlert('payment.webhook_processing_failed', { provider })
    // Non-2xx so the provider retries later.
    return json({ error: { code: 'INTERNAL_ERROR' } }, 500)
  }
}
