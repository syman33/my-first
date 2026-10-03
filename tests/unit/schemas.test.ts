import { describe, expect, it } from 'vitest'
import { addressSchema } from '@/schemas/address'
import { newPasswordFormSchema, profileSchema, registerSchema } from '@/schemas/auth'
import { normalizeSaudiMobile } from '@/schemas/common'

describe('schemas are idempotent (client-parsed output re-validates on the server)', () => {
  it('register', () => {
    const once = registerSchema.parse({
      name: '  Layla Ahmed ',
      email: ' Layla@Example.TEST ',
      phone: '٠٥١٢٣٤٥٦٧٨',
      password: 'a-strong-passphrase',
      locale: 'ar',
      acceptTerms: true,
    })
    expect(once).toMatchObject({
      name: 'Layla Ahmed',
      email: 'layla@example.test',
      phone: '+966512345678',
    })
    expect(registerSchema.parse(once)).toEqual(once)
  })

  it('register without a phone', () => {
    const once = registerSchema.parse({
      name: 'Omar',
      email: 'o@example.test',
      phone: '',
      password: 'a-strong-passphrase',
      acceptTerms: true,
    })
    expect(once.phone).toBeNull()
    expect(registerSchema.parse(once)).toEqual(once)
  })

  it('address', () => {
    const once = addressSchema.parse({
      label: '',
      fullName: 'Noura Alqahtani',
      phone: '0551234567',
      city: 'الرياض',
      district: 'العليا',
      street: 'طريق الملك فهد',
      buildingNumber: '٢٩٢٩',
      postalCode: '12211',
      additionalNumber: '',
      shortAddress: 'rrrd2929',
      instructions: '',
    })
    expect(once).toMatchObject({
      label: null,
      buildingNumber: '2929',
      additionalNumber: null,
      shortAddress: 'RRRD2929',
      instructions: null,
      isDefault: false,
    })
    expect(addressSchema.parse(once)).toEqual(once)
  })

  it('profile', () => {
    const once = profileSchema.parse({ name: 'Sara', phone: null, locale: 'en' })
    expect(profileSchema.parse(once)).toEqual(once)
  })
})

describe('validation messages are dictionary keys', () => {
  it('rejects unticked consent', () => {
    const result = registerSchema.safeParse({
      name: 'Omar',
      email: 'o@example.test',
      password: 'a-strong-passphrase',
      acceptTerms: false,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => [i.path.join('.'), i.message])).toEqual([
      ['acceptTerms', 'consent'],
    ])
  })

  it('flags mismatched password confirmation on the confirm field', () => {
    const result = newPasswordFormSchema.safeParse({
      password: 'a-strong-passphrase',
      confirm: 'something-else',
    })
    expect(result.error?.issues.map((i) => [i.path.join('.'), i.message])).toEqual([
      ['confirm', 'passwordMismatch'],
    ])
  })

  it('rejects invalid national address numbers', () => {
    const result = addressSchema.safeParse({
      fullName: 'Noura',
      phone: '0551234567',
      city: 'Riyadh',
      district: 'Olaya',
      street: 'King Fahd Road',
      buildingNumber: '12',
      postalCode: '1221',
      shortAddress: 'RR2929',
    })
    const messages = Object.fromEntries(
      result.error?.issues.map((i) => [i.path.join('.'), i.message]) ?? [],
    )
    expect(messages).toMatchObject({
      buildingNumber: 'buildingNumber',
      postalCode: 'postalCode',
      shortAddress: 'invalid',
    })
  })
})

describe('normalizeSaudiMobile', () => {
  it.each([
    ['0512345678', '+966512345678'],
    ['512345678', '+966512345678'],
    ['+966 51 234 5678', '+966512345678'],
    ['00966512345678', '+966512345678'],
    ['٠٥١٢٣٤٥٦٧٨', '+966512345678'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeSaudiMobile(input)).toBe(expected)
  })

  it.each(['0112345678', '05123', '+971501234567', 'phone'])('rejects %s', (input) => {
    expect(normalizeSaudiMobile(input)).toBeNull()
  })
})
