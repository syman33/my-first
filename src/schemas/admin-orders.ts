import { z } from 'zod'
import { uuidField } from './common'

/** Back-office order actions. Amounts are integer halalas (forms convert SAR input). */

const requiredText = (min: number, max: number) =>
  z
    .string({ error: 'required' })
    .trim()
    .min(min, { error: min <= 1 ? 'required' : 'tooShort' })
    .max(max, { error: 'tooLong' })

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: 'tooLong' })
    .nullish()
    .transform((value) => value || undefined)

export const orderNoteSchema = z.object({ note: optionalText(500) })

export const shipOrderSchema = z.object({
  carrier: optionalText(64),
  trackingNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{3,100}$/, { error: 'invalid' })
    .nullish()
    .or(z.literal(''))
    .transform((value) => value || undefined),
  trackingUrl: z
    .url({ protocol: /^https$/, error: 'url' })
    .max(500, { error: 'tooLong' })
    .nullish()
    .or(z.literal(''))
    .transform((value) => value || undefined),
  note: optionalText(500),
})
export type ShipOrderInput = z.output<typeof shipOrderSchema>

export const cancelOrderAdminSchema = z.object({ reason: requiredText(3, 300) })

export const resolveAttentionSchema = z.object({ note: requiredText(3, 500) })

export const refundSchema = z.object({
  paymentId: uuidField,
  amount: z
    .number({ error: 'amount' })
    .int({ error: 'amount' })
    .min(1, { error: 'amount' })
    .max(100_000_000),
  reason: requiredText(3, 300),
  /** Bank transfer reference — required for cash-on-delivery refunds. */
  reference: optionalText(100),
})
export type RefundInput = z.output<typeof refundSchema>
