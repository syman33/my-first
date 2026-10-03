import 'server-only'
import { logger, maskEmail } from '@/lib/logger'

/**
 * Notification delivery providers.
 *
 * A provider reports what really happened: `SENT` only when the upstream
 * service accepted the message, `SKIPPED` when nothing was delivered (e.g. the
 * development console provider). Transient failures throw so the outbox
 * retries; permanent rejections return FAILED.
 */

export interface OutgoingEmail {
  to: string
  subject: string
  html: string
  text: string
  /** Non-sensitive tag for provider analytics, e.g. the template name. */
  tag?: string
}

export type DeliveryResult =
  | { status: 'SENT'; provider: string; providerMessageId: string | null }
  | { status: 'SKIPPED'; provider: string; reason: string }
  | { status: 'FAILED'; provider: string; reason: string }

export class TransientDeliveryError extends Error {
  override name = 'TransientDeliveryError'
}

export interface EmailProvider {
  readonly name: string
  send(email: OutgoingEmail): Promise<DeliveryResult>
}

/** Development provider: prints the message, delivers nothing. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console'
  async send(email: OutgoingEmail): Promise<DeliveryResult> {
    logger.info('email.console_provider', {
      to: maskEmail(email.to),
      subject: email.subject,
      // Development convenience only: the console provider is rejected in production.
      preview: process.env.NODE_ENV === 'production' ? undefined : email.text,
    })
    return {
      status: 'SKIPPED',
      provider: this.name,
      reason: 'Console email provider (development): message recorded, not delivered',
    }
  }
}

/** Resend transactional email API (https://resend.com). */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend'
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(email: OutgoingEmail): Promise<DeliveryResult> {
    let response: Response
    try {
      response = await this.fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: this.from,
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
          ...(email.tag ? { tags: [{ name: 'template', value: email.tag }] } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch (error) {
      throw new TransientDeliveryError(
        `Resend request failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    if (response.status === 429 || response.status >= 500) {
      throw new TransientDeliveryError(`Resend responded ${response.status}`)
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      return {
        status: 'FAILED',
        provider: this.name,
        reason: `Resend rejected the message (${response.status}): ${body.slice(0, 300)}`,
      }
    }
    const json = (await response.json().catch(() => ({}))) as { id?: string }
    return { status: 'SENT', provider: this.name, providerMessageId: json.id ?? null }
  }
}

export interface OutgoingSms {
  to: string
  text: string
}

export interface SmsProvider {
  readonly name: string
  send(message: OutgoingSms): Promise<DeliveryResult>
}

/** Development SMS/WhatsApp provider: records, delivers nothing. */
export class ConsoleSmsProvider implements SmsProvider {
  constructor(readonly name: string) {}
  async send(message: OutgoingSms): Promise<DeliveryResult> {
    logger.info(`${this.name}.console_provider`, {
      to: `***${message.to.slice(-4)}`,
      text: message.text,
    })
    return {
      status: 'SKIPPED',
      provider: this.name,
      reason: 'Console provider (development): not delivered',
    }
  }
}

let emailProvider: EmailProvider | undefined

export function getEmailProvider(): EmailProvider {
  if (!emailProvider) {
    if (process.env.EMAIL_PROVIDER === 'resend') {
      const key = process.env.RESEND_API_KEY
      const from = process.env.EMAIL_FROM
      if (!key || !from)
        throw new Error('RESEND_API_KEY and EMAIL_FROM must be set for EMAIL_PROVIDER=resend')
      emailProvider = new ResendEmailProvider(key, from)
    } else {
      emailProvider = new ConsoleEmailProvider()
    }
  }
  return emailProvider
}

/** Returns null when the channel is disabled (SMS_PROVIDER / WHATSAPP_PROVIDER = none). */
export function getSmsProvider(channel: 'sms' | 'whatsapp'): SmsProvider | null {
  const setting = channel === 'sms' ? process.env.SMS_PROVIDER : process.env.WHATSAPP_PROVIDER
  return setting === 'console' ? new ConsoleSmsProvider(channel) : null
}

/** Test hook. */
export function setEmailProvider(provider: EmailProvider | undefined): void {
  emailProvider = provider
}
