import { z } from 'zod'
import { ITEM_CONDITIONS, RETURN_REASONS } from '@/lib/orders/returns'
import { uuidField } from './common'

const optionalNote = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: 'tooLong' })
    .nullish()
    .transform((value) => value || null)

/** A customer's return request. Amounts are never sent: the server computes refunds. */
export const returnRequestSchema = z.object({
  items: z
    .array(
      z.object({
        orderItemId: uuidField,
        quantity: z.number({ error: 'required' }).int().min(1).max(99),
      }),
    )
    .min(1, { error: 'returnItemsRequired' })
    .max(50)
    .refine((items) => new Set(items.map((item) => item.orderItemId)).size === items.length, {
      error: 'invalid',
    }),
  reason: z.enum(RETURN_REASONS, { error: 'required' }),
  note: optionalNote(1000),
})
export type ReturnRequestInput = z.output<typeof returnRequestSchema>

export const returnDecisionSchema = z.object({ note: optionalNote(1000) })

export const returnRejectionSchema = z.object({
  note: z
    .string({ error: 'required' })
    .trim()
    .min(3, { error: 'tooShort' })
    .max(1000, { error: 'tooLong' }),
})

export const returnReceiptSchema = z.object({
  items: z
    .array(z.object({ returnItemId: uuidField, condition: z.enum(ITEM_CONDITIONS) }))
    .min(1)
    .max(50),
  note: optionalNote(1000),
})
export type ReturnReceiptInput = z.output<typeof returnReceiptSchema>

/**
 * Closing a received return. `amount` defaults to the computed pro-rata
 * refund; staff may lower it (e.g. damage) or raise it up to the refundable
 * balance (e.g. shipping as a goodwill gesture). Cash-on-delivery orders are
 * refunded by bank transfer, recorded with its reference.
 */
export const returnCompletionSchema = z.object({
  amount: z.number().int().min(0).max(100_000_000).nullish(),
  note: optionalNote(1000),
  transferReference: z
    .string()
    .trim()
    .max(100, { error: 'tooLong' })
    .nullish()
    .transform((value) => value || null),
})
export type ReturnCompletionInput = z.output<typeof returnCompletionSchema>
