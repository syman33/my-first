import 'server-only'
import { env } from '@/lib/env'
import { generateToken } from '@/lib/security/tokens'
import { AppError } from '@/lib/errors'
import { addDays } from '@/utils/time'

/**
 * Shipping provider abstraction (spec §44). Implemented today:
 *  - ManualShippingProvider: staff book the parcel with the carrier (SPL,
 *    SMSA, Aramex, …) in the carrier's own system and record carrier and
 *    tracking number here. Nothing is pretended: no API call is made.
 *  - MockShippingProvider: development only, invents labelled test tracking
 *    numbers.
 * Carrier API integrations (e.g. SPL) plug in behind the same interface.
 */

export interface CreateShipmentInput {
  orderNumber: string
  service: 'STANDARD' | 'EXPRESS'
  /** Manual provider: entered by staff. */
  carrier?: string
  trackingNumber?: string
  trackingUrl?: string
  estimatedDays?: number
}

export interface CreatedShipment {
  carrier: string
  trackingNumber: string | null
  trackingUrl: string | null
  providerShipmentId: string | null
  estimatedDeliveryAt: Date | null
}

export interface ShippingProvider {
  readonly name: 'manual' | 'mock'
  readonly simulated: boolean
  createShipment(input: CreateShipmentInput): Promise<CreatedShipment>
  cancelShipment(providerShipmentId: string | null): Promise<void>
}

/** Known carriers' public tracking pages (used when staff do not paste a URL). */
const TRACKING_URLS: Record<string, (tracking: string) => string> = {
  SPL: (t) => `https://splonline.com.sa/en/shipment-tracking/?tid=${encodeURIComponent(t)}`,
  SMSA: (t) => `https://www.smsaexpress.com/trackingdetails?tracknumbers=${encodeURIComponent(t)}`,
  ARAMEX: (t) => `https://www.aramex.com/track/results?ShipmentNumber=${encodeURIComponent(t)}`,
}

export class ManualShippingProvider implements ShippingProvider {
  readonly name = 'manual' as const
  readonly simulated = false

  async createShipment(input: CreateShipmentInput): Promise<CreatedShipment> {
    const carrier = input.carrier?.trim()
    if (!carrier)
      throw new AppError('VALIDATION_ERROR', 'Carrier is required', {
        status: 422,
        fieldErrors: { carrier: 'required' },
      })
    const tracking = input.trackingNumber?.trim() || null
    const url =
      input.trackingUrl?.trim() ||
      (tracking ? (TRACKING_URLS[carrier.toUpperCase()]?.(tracking) ?? null) : null)
    return {
      carrier,
      trackingNumber: tracking,
      trackingUrl: url,
      providerShipmentId: null,
      estimatedDeliveryAt: input.estimatedDays ? addDays(new Date(), input.estimatedDays) : null,
    }
  }

  async cancelShipment(): Promise<void> {
    // Booked outside the system: staff cancel it with the carrier.
  }
}

export class MockShippingProvider implements ShippingProvider {
  readonly name = 'mock' as const
  readonly simulated = true

  async createShipment(input: CreateShipmentInput): Promise<CreatedShipment> {
    const tracking = `MOCK-${generateToken().slice(0, 10).toUpperCase()}`
    return {
      carrier: 'MOCK (test)',
      trackingNumber: tracking,
      trackingUrl: null,
      providerShipmentId: `mock_shp_${tracking}`,
      estimatedDeliveryAt: addDays(
        new Date(),
        input.estimatedDays ?? (input.service === 'EXPRESS' ? 2 : 5),
      ),
    }
  }

  async cancelShipment(): Promise<void> {
    // Nothing was booked anywhere: a simulated shipment has nothing to cancel.
  }
}

let override: ShippingProvider | null = null

export function getShippingProvider(): ShippingProvider {
  if (override) return override
  return env().SHIPPING_PROVIDER === 'mock'
    ? new MockShippingProvider()
    : new ManualShippingProvider()
}

export function setShippingProvider(provider: ShippingProvider | null): void {
  override = provider
}
