import {
  ORDER_STATUSES_CUSTOMER_MAY_CANCEL,
  PAYMENT_METHODS,
  type SettingsGroup,
} from '@/schemas/settings'
import { halalasToSarString, sarToHalalas } from '@/utils/money'
import { bpsToPercent, percentToBps } from '@/utils/percent'

/**
 * How each settings group is edited in the back office: one descriptor per
 * field, plus the conversions between stored values (halalas, basis points,
 * numbers) and form text. Pure, so the form and its tests share one source.
 */

export type SettingsFieldKind =
  | 'text'
  | 'textarea'
  | 'email'
  | 'url'
  | 'phone'
  | 'money'
  | 'optionalMoney'
  | 'int'
  | 'percent'
  | 'boolean'
  | 'options'

export interface SettingsField {
  /** Path inside the group's document, e.g. "social.instagram". */
  path: string
  kind: SettingsFieldKind
  dir?: 'rtl' | 'ltr'
  maxLength?: number
  options?: readonly string[]
  /** Begin a new row in the two-column layout (keeps related pairs side by side). */
  rowStart?: boolean
}

const text = (path: string, dir: 'rtl' | 'ltr', maxLength: number): SettingsField => ({
  path,
  kind: 'text',
  dir,
  maxLength,
})

export const SETTINGS_FIELDS: Record<SettingsGroup, readonly SettingsField[]> = {
  store: [
    text('nameAr', 'rtl', 80),
    text('nameEn', 'ltr', 80),
    text('legalNameAr', 'rtl', 160),
    text('legalNameEn', 'ltr', 160),
    text('addressAr', 'rtl', 300),
    text('addressEn', 'ltr', 300),
    text('phone', 'ltr', 30),
    { path: 'whatsapp', kind: 'phone', maxLength: 30 },
    { path: 'email', kind: 'email', maxLength: 254 },
    { ...text('commercialRegistration', 'ltr', 10), rowStart: true },
    text('vatNumber', 'ltr', 15),
    { path: 'social.instagram', kind: 'url', maxLength: 300 },
    { path: 'social.tiktok', kind: 'url', maxLength: 300 },
    { path: 'social.x', kind: 'url', maxLength: 300 },
    { path: 'social.snapchat', kind: 'url', maxLength: 300 },
  ],
  shipping: [
    { path: 'standardFee', kind: 'money' },
    { path: 'freeShippingThreshold', kind: 'optionalMoney' },
    { path: 'standardDaysMin', kind: 'int' },
    { path: 'standardDaysMax', kind: 'int' },
    { path: 'expressEnabled', kind: 'boolean' },
    { path: 'freeShippingAppliesToExpress', kind: 'boolean' },
    { path: 'expressFee', kind: 'money' },
    { path: 'expressDaysMin', kind: 'int', rowStart: true },
    { path: 'expressDaysMax', kind: 'int' },
  ],
  tax: [
    { path: 'enabled', kind: 'boolean' },
    { path: 'rateBps', kind: 'percent' },
    { path: 'pricesIncludeTax', kind: 'boolean' },
    { path: 'shippingTaxable', kind: 'boolean' },
  ],
  cod: [
    { path: 'enabled', kind: 'boolean' },
    { path: 'fee', kind: 'money' },
    { path: 'minOrder', kind: 'money', rowStart: true },
    { path: 'maxOrder', kind: 'money' },
  ],
  checkout: [
    {
      path: 'customerCancellableStatuses',
      kind: 'options',
      options: ORDER_STATUSES_CUSTOMER_MAY_CANCEL,
    },
    { path: 'maxQuantityPerItem', kind: 'int' },
    { path: 'reservationMinutes', kind: 'int' },
    { path: 'requireEmailVerification', kind: 'boolean' },
  ],
  payments: [{ path: 'enabledMethods', kind: 'options', options: PAYMENT_METHODS }],
  returns: [
    { path: 'enabled', kind: 'boolean' },
    { path: 'windowDays', kind: 'int' },
  ],
  reviews: [
    { path: 'requireVerifiedPurchase', kind: 'boolean' },
    { path: 'autoApprove', kind: 'boolean' },
  ],
  seo: [
    text('titleAr', 'rtl', 160),
    text('titleEn', 'ltr', 160),
    { path: 'descriptionAr', kind: 'textarea', dir: 'rtl', maxLength: 320 },
    { path: 'descriptionEn', kind: 'textarea', dir: 'ltr', maxLength: 320 },
  ],
}

export type SettingsFormValue = string | boolean | string[]
export type SettingsFormValues = Record<string, SettingsFormValue>
export type SettingsConversionError = 'amount' | 'invalid' | 'required'

/** Form field names are flat: "social.instagram" → "social__instagram". */
export function settingsFieldName(path: string): string {
  return path.replaceAll('.', '__')
}

function readPath(document: unknown, path: string): unknown {
  let value: unknown = document
  for (const key of path.split('.')) {
    if (value === null || typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return value
}

function writePath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  const last = keys.pop() ?? path
  let node = target
  for (const key of keys) {
    const next = node[key]
    if (next === null || typeof next !== 'object') node[key] = {}
    node = node[key] as Record<string, unknown>
  }
  node[last] = value
}

/** A stored settings document → the editor's initial values. */
export function settingsToFormValues(group: SettingsGroup, document: unknown): SettingsFormValues {
  const values: SettingsFormValues = {}
  for (const field of SETTINGS_FIELDS[group]) {
    const value = readPath(document, field.path)
    const name = settingsFieldName(field.path)
    switch (field.kind) {
      case 'boolean':
        values[name] = value === true
        break
      case 'options':
        values[name] = Array.isArray(value) ? value.map(String) : []
        break
      case 'money':
      case 'optionalMoney':
        values[name] = typeof value === 'number' ? halalasToSarString(value) : ''
        break
      case 'percent':
        values[name] = typeof value === 'number' ? bpsToPercent(value) : ''
        break
      case 'int':
        values[name] = typeof value === 'number' ? String(value) : ''
        break
      default:
        values[name] = typeof value === 'string' ? value : ''
    }
  }
  return values
}

/**
 * Editor values → the document the API validates. Text that cannot be
 * converted (e.g. "12.345" SAR) is reported per form field; everything else
 * (ranges, formats, cross-field rules) is validated by the server schema.
 */
export function formValuesToSettings(
  group: SettingsGroup,
  values: SettingsFormValues,
): { document: Record<string, unknown>; errors: Record<string, SettingsConversionError> } {
  const document: Record<string, unknown> = {}
  const errors: Record<string, SettingsConversionError> = {}
  for (const field of SETTINGS_FIELDS[group]) {
    const name = settingsFieldName(field.path)
    const raw = values[name]
    const textValue = typeof raw === 'string' ? raw.trim() : ''
    switch (field.kind) {
      case 'boolean':
        writePath(document, field.path, raw === true)
        break
      case 'options':
        writePath(
          document,
          field.path,
          Array.isArray(raw) ? raw : typeof raw === 'string' && raw !== '' ? [raw] : [],
        )
        break
      case 'money':
      case 'optionalMoney': {
        if (textValue === '') {
          if (field.kind === 'optionalMoney') writePath(document, field.path, null)
          else errors[name] = 'required'
          break
        }
        let halalas: number | undefined
        try {
          halalas = sarToHalalas(textValue)
        } catch {
          halalas = undefined
        }
        if (halalas === undefined || halalas < 0) errors[name] = 'amount'
        else writePath(document, field.path, halalas)
        break
      }
      case 'percent': {
        const bps = percentToBps(textValue)
        if (bps === undefined) errors[name] = textValue === '' ? 'required' : 'amount'
        else writePath(document, field.path, bps)
        break
      }
      case 'int':
        if (/^\d{1,6}$/.test(textValue)) writePath(document, field.path, Number(textValue))
        else errors[name] = textValue === '' ? 'required' : 'invalid'
        break
      default:
        writePath(document, field.path, typeof raw === 'string' ? raw : '')
    }
  }
  return { document, errors }
}
