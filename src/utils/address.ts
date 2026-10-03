import type { Locale } from '@/i18n/config'

export interface AddressParts {
  buildingNumber: string
  street: string
  district: string
  city: string
  postalCode: string
  additionalNumber?: string | null
}

/**
 * Saudi National Address as display lines:
 *   "2929 King Fahd Road" / "Al Olaya, Riyadh" / "12211-7654"
 */
export function addressLines(address: AddressParts, locale: Locale): [string, string, string] {
  const separator = locale === 'ar' ? '، ' : ', '
  return [
    `${address.buildingNumber} ${address.street}`,
    `${address.district}${separator}${address.city}`,
    address.additionalNumber
      ? `${address.postalCode}-${address.additionalNumber}`
      : address.postalCode,
  ]
}
