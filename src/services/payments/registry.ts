import 'server-only'
import { env } from '@/lib/env'
import { MockPaymentProvider } from './mock.provider'
import { MoyasarPaymentProvider } from './moyasar.provider'
import type { PaymentProvider, ProviderName } from './provider'

let override: PaymentProvider | null = null

/** The configured provider (PAYMENT_PROVIDER). Tests may swap it with `setPaymentProvider`. */
export function getPaymentProvider(): PaymentProvider {
  if (override) return override
  return providerByName(env().PAYMENT_PROVIDER)
}

export function providerByName(name: ProviderName): PaymentProvider {
  return name === 'moyasar' ? new MoyasarPaymentProvider() : new MockPaymentProvider()
}

export function isProviderName(value: string): value is ProviderName {
  return value === 'mock' || value === 'moyasar'
}

export function setPaymentProvider(provider: PaymentProvider | null): void {
  override = provider
}
