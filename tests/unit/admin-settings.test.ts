import { describe, expect, it } from 'vitest'
import { getDictionary } from '@/i18n'
import {
  formValuesToSettings,
  SETTINGS_FIELDS,
  settingsFieldName,
  settingsToFormValues,
} from '@/lib/admin/settings-fields'
import { normalizeInternationalPhone } from '@/schemas/common'
import {
  defaultSettings,
  parseStoredSettings,
  SETTINGS_GROUPS,
  settingsSchemas,
} from '@/schemas/settings'
import { whatsappHref } from '@/utils/phone'
import { bpsToPercent, percentToBps } from '@/utils/percent'

const issues = (result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]),
  )

describe('settings editor descriptors', () => {
  it('cover every group with a label in both languages, and hints only for real fields', () => {
    for (const locale of ['ar', 'en'] as const) {
      const t = getDictionary(locale).admin.settings
      for (const group of SETTINGS_GROUPS) {
        const labels = t.fields[group] as Record<string, string>
        const paths = SETTINGS_FIELDS[group].map((field) => settingsFieldName(field.path))
        expect(Object.keys(labels).sort(), `${locale}.${group}`).toEqual([...paths].sort())
        for (const key of Object.keys(t.hints[group])) expect(paths).toContain(key)
      }
    }
  })

  it('edit every key each schema stores (nothing hidden, nothing invented)', () => {
    for (const group of SETTINGS_GROUPS) {
      const document = defaultSettings(group) as Record<string, unknown>
      const topLevel = new Set(SETTINGS_FIELDS[group].map((field) => field.path.split('.')[0]))
      const schemaKeys = Object.keys(settingsSchemas[group].shape)
      expect([...topLevel].sort(), group).toEqual(schemaKeys.sort())
      expect(
        Object.keys(document).every((key) => topLevel.has(key)),
        group,
      ).toBe(true)
    }
  })

  it('round-trips the defaults of every group through the form unchanged', () => {
    for (const group of SETTINGS_GROUPS) {
      const stored = defaultSettings(group)
      const { document, errors } = formValuesToSettings(group, settingsToFormValues(group, stored))
      expect(errors, group).toEqual({})
      expect(settingsSchemas[group].parse(document), group).toEqual(stored)
    }
  })

  it('converts SAR and percentages, and reports text it cannot convert', () => {
    const values = settingsToFormValues('shipping', defaultSettings('shipping'))
    expect(values).toMatchObject({ standardFee: '25.00', freeShippingThreshold: '299.00' })
    const edited = formValuesToSettings('shipping', {
      ...values,
      standardFee: '19.5',
      freeShippingThreshold: '  ',
      expressFee: '12.345',
      standardDaysMax: 'five',
    })
    expect(edited.document).toMatchObject({ standardFee: 1_950, freeShippingThreshold: null })
    expect(edited.errors).toEqual({ expressFee: 'amount', standardDaysMax: 'invalid' })
    expect(
      formValuesToSettings('tax', {
        ...settingsToFormValues('tax', defaultSettings('tax')),
        rateBps: '15',
      }).document.rateBps,
    ).toBe(1_500)
  })

  it('writes nested paths and flattens their form names', () => {
    expect(settingsFieldName('social.instagram')).toBe('social__instagram')
    const values = settingsToFormValues('store', defaultSettings('store'))
    const { document } = formValuesToSettings('store', {
      ...values,
      social__instagram: 'https://instagram.com/velora',
    })
    expect(document.social).toEqual({
      instagram: 'https://instagram.com/velora',
      tiktok: '',
      x: '',
      snapchat: '',
    })
    expect(settingsSchemas.store.parse(document).social).toEqual({
      instagram: 'https://instagram.com/velora',
    })
  })
})

describe('settings validation messages are dictionary keys', () => {
  it('points range errors at the maximum field', () => {
    const shipping = { ...defaultSettings('shipping'), standardDaysMin: 6, standardDaysMax: 3 }
    expect(issues(settingsSchemas.shipping.safeParse(shipping))).toEqual({
      standardDaysMax: 'rangeOrder',
    })
    const cod = { ...defaultSettings('cod'), minOrder: 10_000, maxOrder: 5_000 }
    expect(issues(settingsSchemas.cod.safeParse(cod))).toEqual({ maxOrder: 'rangeOrder' })
  })

  it('checks Saudi registration numbers, links and contact details', () => {
    const store = defaultSettings('store')
    expect(
      issues(
        settingsSchemas.store.safeParse({
          ...store,
          vatNumber: '123',
          commercialRegistration: '10-10',
          email: 'nope',
          social: { instagram: 'http://instagram.com/velora' },
          whatsapp: '12',
          nameAr: ' ',
        }),
      ),
    ).toEqual({
      vatNumber: 'vatNumber',
      commercialRegistration: 'commercialRegistration',
      email: 'email',
      'social.instagram': 'url',
      whatsapp: 'phone',
      nameAr: 'required',
    })
    expect(
      settingsSchemas.store.parse({
        ...store,
        whatsapp: '٠٥٠١٢٣٤٥٦٧',
        vatNumber: '300000000000003',
      }),
    ).toMatchObject({ whatsapp: '+966501234567', vatNumber: '300000000000003' })
    expect(issues(settingsSchemas.payments.safeParse({ enabledMethods: [] }))).toEqual({
      enabledMethods: 'required',
    })
  })

  it('has a message for every key the settings schemas use', () => {
    const fields = getDictionary('en').errors.fields
    for (const key of ['rangeOrder', 'vatNumber', 'commercialRegistration', 'phone', 'url']) {
      expect(fields).toHaveProperty(key)
    }
  })
})

describe('stored settings are read leniently', () => {
  it('keeps valid keys and falls back to defaults for invalid ones', () => {
    const { settings, invalidKeys } = parseStoredSettings('shipping', {
      standardFee: 3_000,
      expressFee: -5,
    })
    expect(invalidKeys).toEqual(['expressFee'])
    expect(settings).toMatchObject({ standardFee: 3_000, expressFee: 4_500 })
  })

  it('uses the defaults when the document itself is unusable', () => {
    expect(parseStoredSettings('cod', 'garbage')).toMatchObject({
      settings: defaultSettings('cod'),
    })
    // A cross-field rule that still fails after dropping keys → defaults.
    const broken = parseStoredSettings('shipping', { standardDaysMin: 9, standardDaysMax: 3 })
    expect(broken.settings).toEqual(defaultSettings('shipping'))
  })
})

describe('phone and percent helpers', () => {
  it('normalises international numbers and builds WhatsApp links', () => {
    expect(normalizeInternationalPhone('0501234567')).toBe('+966501234567')
    expect(normalizeInternationalPhone('+971 50 123 4567')).toBe('+971501234567')
    expect(normalizeInternationalPhone('00447911123456')).toBe('+447911123456')
    expect(normalizeInternationalPhone('12345')).toBeNull()
    expect(whatsappHref('+966501234567')).toBe('https://wa.me/966501234567')
    expect(whatsappHref('0501234567')).toBeNull()
  })

  it('converts percentages to basis points exactly', () => {
    expect(percentToBps('15')).toBe(1_500)
    expect(percentToBps('12.5')).toBe(1_250)
    expect(percentToBps('0.05')).toBe(5)
    expect(percentToBps('7٫25')).toBe(725)
    expect(percentToBps('12.345')).toBeUndefined()
    expect(percentToBps('-1')).toBeUndefined()
    expect(bpsToPercent(1_250)).toBe('12.5')
    expect(bpsToPercent(1_205)).toBe('12.05')
    expect(bpsToPercent(1_500)).toBe('15')
  })
})
