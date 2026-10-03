import { z } from 'zod'
import {
  emailField,
  localeField,
  nameField,
  optionalSaudiMobileField,
  passwordField,
  tokenField,
} from './common'

export const registerSchema = z.object({
  name: nameField,
  email: emailField,
  phone: optionalSaudiMobileField,
  password: passwordField,
  locale: localeField,
  // Boolean input (a checkbox) that must be ticked.
  acceptTerms: z.boolean({ error: 'consent' }).refine((accepted) => accepted, { error: 'consent' }),
})
export type RegisterInput = z.input<typeof registerSchema>

export const loginSchema = z.object({
  email: emailField,
  // No length policy on login: we only verify, never reveal policy details.
  password: z
    .string({ error: 'required' })
    .min(1, { error: 'required' })
    .max(128, { error: 'passwordTooLong' }),
})
export type LoginInput = z.input<typeof loginSchema>

export const forgotPasswordSchema = z.object({ email: emailField, locale: localeField })

export const resetPasswordSchema = z.object({ token: tokenField, password: passwordField })

export const verifyEmailSchema = z.object({ token: tokenField })

export const changePasswordSchema = z.object({
  currentPassword: z.string({ error: 'required' }).min(1, { error: 'required' }).max(128),
  newPassword: passwordField,
})

export const profileSchema = z.object({
  name: nameField,
  phone: optionalSaudiMobileField,
  locale: z.enum(['ar', 'en']),
})

/** Client form: new password typed twice (the API receives only `password`). */
export const newPasswordFormSchema = z
  .object({
    password: passwordField,
    confirm: z.string({ error: 'required' }).min(1, { error: 'required' }),
  })
  .refine((values) => values.password === values.confirm, {
    path: ['confirm'],
    error: 'passwordMismatch',
  })

/** Client form for the account security page. */
export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string({ error: 'required' }).min(1, { error: 'required' }).max(128),
    newPassword: passwordField,
    confirm: z.string({ error: 'required' }).min(1, { error: 'required' }),
  })
  .refine((values) => values.newPassword === values.confirm, {
    path: ['confirm'],
    error: 'passwordMismatch',
  })
