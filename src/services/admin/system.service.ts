import 'server-only'
import { env } from '@/lib/env'

/**
 * What the back office may know about server integrations: which provider is
 * active and whether it is real. Secret values never leave this module.
 */

export type IntegrationKey =
  | 'payments'
  | 'shipping'
  | 'email'
  | 'sms'
  | 'whatsapp'
  | 'storage'
  | 'analytics'
  | 'cron'
  | 'rateLimit'

/** live: a real service · simulated: nothing real happens · local: works on this server only · off: disabled. */
export type IntegrationState = 'live' | 'simulated' | 'local' | 'off'

export interface IntegrationStatus {
  key: IntegrationKey
  provider: string
  state: IntegrationState
}

export function getIntegrationStatus(): IntegrationStatus[] {
  const config = env()
  const messaging = (provider: 'console' | 'none'): IntegrationState =>
    provider === 'none' ? 'off' : 'simulated'
  return [
    {
      key: 'payments',
      provider: config.PAYMENT_PROVIDER,
      state: config.PAYMENT_PROVIDER === 'mock' ? 'simulated' : 'live',
    },
    {
      key: 'shipping',
      // "manual": staff book parcels with the carrier and enter tracking numbers — real, not simulated.
      provider: config.SHIPPING_PROVIDER,
      state: config.SHIPPING_PROVIDER === 'mock' ? 'simulated' : 'live',
    },
    {
      key: 'email',
      provider: config.EMAIL_PROVIDER,
      state: config.EMAIL_PROVIDER === 'console' ? 'simulated' : 'live',
    },
    { key: 'sms', provider: config.SMS_PROVIDER, state: messaging(config.SMS_PROVIDER) },
    {
      key: 'whatsapp',
      provider: config.WHATSAPP_PROVIDER,
      state: messaging(config.WHATSAPP_PROVIDER),
    },
    {
      key: 'storage',
      provider: config.STORAGE_PROVIDER,
      state: config.STORAGE_PROVIDER === 's3' ? 'live' : 'local',
    },
    {
      key: 'analytics',
      provider: config.ANALYTICS_PROVIDER,
      state:
        config.ANALYTICS_PROVIDER === 'none'
          ? 'off'
          : config.ANALYTICS_PROVIDER === 'console'
            ? 'simulated'
            : 'live',
    },
    {
      key: 'cron',
      // The variable's name only — never its value.
      provider: 'CRON_SECRET',
      state: config.CRON_SECRET ? 'live' : 'off',
    },
    {
      key: 'rateLimit',
      provider: config.RATE_LIMIT_PROVIDER,
      state: config.RATE_LIMIT_PROVIDER === 'postgres' ? 'live' : 'local',
    },
  ]
}
