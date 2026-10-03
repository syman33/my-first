import { z } from 'zod'
import { emailField, localeField, nameField, optionalSaudiMobileField, tokenField } from './common'

export const newsletterSubscribeSchema = z.object({
  email: emailField,
  locale: localeField,
  source: z.enum(['footer', 'home', 'checkout']).default('home'),
})

export const newsletterUnsubscribeSchema = z.object({ token: tokenField })

export const contactMessageSchema = z.object({
  name: nameField,
  email: emailField,
  phone: optionalSaudiMobileField,
  subject: z
    .string({ error: 'required' })
    .trim()
    .min(3, { error: 'tooShort' })
    .max(160, { error: 'tooLong' }),
  message: z
    .string({ error: 'required' })
    .trim()
    .min(10, { error: 'tooShort' })
    .max(5000, { error: 'tooLong' }),
  locale: localeField,
})
export type ContactMessageInput = z.input<typeof contactMessageSchema>
