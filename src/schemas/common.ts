import * as z from 'zod'

/**
 * Shared field schemas (client forms + server validation). Error messages are
 * dictionary keys under `errors.fields.*`, localised at the UI/API boundary.
 */

/** Arabic-Indic (U+0660–0669) and Eastern Arabic-Indic (U+06F0–06F9) digits → 0-9. */
function latinDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
}

export const emailField = z
  .string({ error: 'required' })
  .trim()
  .toLowerCase()
  .min(1, { error: 'required' })
  .max(254, { error: 'tooLong' })
  .pipe(z.email({ error: 'email' }))

export const passwordField = z
  .string({ error: 'required' })
  .min(8, { error: 'passwordTooShort' })
  .max(128, { error: 'passwordTooLong' })

export const nameField = z
  .string({ error: 'required' })
  .trim()
  .min(2, { error: 'tooShort' })
  .max(120, { error: 'tooLong' })

/**
 * Saudi mobile number, normalised to E.164 (+9665XXXXXXXX). Accepts common
 * local formats: 05XXXXXXXX, 5XXXXXXXX, 9665XXXXXXXX, 009665XXXXXXXX and
 * Arabic-Indic digits.
 */
export function normalizeSaudiMobile(input: string): string | null {
  const digits = latinDigits(input).replace(/[\s()-]/g, '')
  const match = /^(?:\+?966|00966|0)?(5\d{8})$/.exec(digits)
  return match ? `+966${match[1]}` : null
}

/**
 * Any international number in E.164 (+<country><number>, 8–15 digits), e.g. a
 * WhatsApp Business line. Saudi mobiles may be typed in local form (05…).
 */
export function normalizeInternationalPhone(input: string): string | null {
  const saudi = normalizeSaudiMobile(input)
  if (saudi) return saudi
  const digits = latinDigits(input).replace(/[\s()-]/g, '')
  const match = /^(?:\+|00)([1-9]\d{7,14})$/.exec(digits)
  return match ? `+${match[1]}` : null
}

export const saudiMobileField = z
  .string({ error: 'required' })
  .trim()
  .min(1, { error: 'required' })
  .transform((value, ctx) => {
    const normalized = normalizeSaudiMobile(value)
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'phone' })
      return z.NEVER
    }
    return normalized
  })

/** Optional mobile: blank/null/absent → null. Idempotent, so client-parsed output re-validates on the server. */
export const optionalSaudiMobileField = z
  .string()
  .trim()
  .nullish()
  .transform((value, ctx) => {
    if (!value) return null
    const normalized = normalizeSaudiMobile(value)
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'phone' })
      return z.NEVER
    }
    return normalized
  })

export const localeField = z.enum(['ar', 'en']).default('ar')

export const uuidField = z.uuid({ error: 'invalid' })

/** Opaque tokens from emails (base64url, 43 chars for 32 bytes). */
export const tokenField = z
  .string({ error: 'required' })
  .trim()
  .regex(/^[A-Za-z0-9_-]{20,200}$/, { error: 'invalid' })
