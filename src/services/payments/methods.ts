import 'server-only'
import type { PaymentMethodCode, PricingResult } from '@/lib/pricing/order-totals'
import { env } from '@/lib/env'
import type { CodSettings, PaymentSettings } from '@/schemas/settings'

/** Online methods each provider can actually process (COD never goes through a provider). */
const PROVIDER_METHODS: Record<'mock' | 'moyasar', readonly PaymentMethodCode[]> = {
  mock: ['MADA', 'CARD', 'APPLE_PAY', 'STC_PAY'],
  moyasar: ['MADA', 'CARD', 'APPLE_PAY', 'STC_PAY'],
}

export function configuredPaymentProvider(): 'mock' | 'moyasar' {
  return env().PAYMENT_PROVIDER
}

export interface PaymentMethodOption {
  method: PaymentMethodCode
  available: boolean
  /** Why a configured method cannot be used for this order. */
  reason: 'COD_RANGE' | 'COD_DISABLED' | null
}

/**
 * Methods offered at checkout = enabled by the merchant ∩ supported by the
 * configured provider, with COD limited by its settings and order value.
 */
export function paymentMethodOptions(
  payments: PaymentSettings,
  cod: CodSettings,
  totals: PricingResult,
): PaymentMethodOption[] {
  const supported = PROVIDER_METHODS[configuredPaymentProvider()]
  return payments.enabledMethods.flatMap((method): PaymentMethodOption[] => {
    if (method === 'COD') {
      if (!cod.enabled) return []
      return [
        {
          method,
          available: totals.codAvailable,
          reason: totals.codAvailable ? null : 'COD_RANGE',
        },
      ]
    }
    return supported.includes(method) ? [{ method, available: true, reason: null }] : []
  })
}
