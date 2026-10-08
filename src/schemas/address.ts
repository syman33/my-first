import * as z from 'zod'
import { nameField, saudiMobileField } from './common'

/**
 * Saudi National Address. Digit fields accept Arabic-Indic digits. Optional
 * fields accept null, so parsed output re-validates unchanged (client forms
 * submit the parsed values).
 */
const digits = (length: number, key: string) =>
  z
    .string({ error: 'required' })
    .trim()
    .transform((v) =>
      v
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)),
    )
    .pipe(z.string().regex(new RegExp(`^\\d{${length}}$`), { error: key }))

const text = (min: number, max: number) =>
  z
    .string({ error: 'required' })
    .trim()
    .min(min, { error: min <= 1 ? 'required' : 'tooShort' })
    .max(max, { error: 'tooLong' })

export const addressSchema = z.object({
  label: z
    .string()
    .trim()
    .max(40, { error: 'tooLong' })
    .nullish()
    .transform((v) => v || null),
  fullName: nameField,
  phone: saudiMobileField,
  city: text(2, 80),
  district: text(2, 80),
  street: text(2, 120),
  buildingNumber: digits(4, 'buildingNumber'),
  postalCode: digits(5, 'postalCode'),
  additionalNumber: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v || undefined)
    .pipe(digits(4, 'additionalNumber').optional())
    .transform((v) => v ?? null),
  shortAddress: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v.toUpperCase() : null))
    .refine((v) => v === null || /^[A-Z]{4}\d{4}$/.test(v), { error: 'invalid' }),
  instructions: z
    .string()
    .trim()
    .max(500, { error: 'tooLong' })
    .nullish()
    .transform((v) => v || null),
  isDefault: z.boolean().optional().default(false),
})

export type AddressInput = z.input<typeof addressSchema>
export type AddressData = z.output<typeof addressSchema>
