import { z } from 'zod'
import { addressSchema } from './address'
import { uuidField } from './common'
import { PAYMENT_METHODS } from './settings'

export const SHIPPING_METHODS = ['STANDARD', 'EXPRESS'] as const

export const checkoutAddressSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('saved'), addressId: uuidField }),
  z.object({ type: z.literal('new'), address: addressSchema, save: z.boolean().default(false) }),
])

/**
 * What the shopper chooses at checkout. Prices are deliberately absent:
 * `expectedTotal` is only compared with the server's total so the customer
 * is never charged an amount they did not see (CART_CHANGED otherwise).
 */
export const checkoutSchema = z.object({
  address: checkoutAddressSchema,
  shippingMethod: z.enum(SHIPPING_METHODS),
  paymentMethod: z.enum(PAYMENT_METHODS),
  customerNote: z
    .string()
    .trim()
    .max(500, { error: 'tooLong' })
    .nullish()
    .transform((value) => value || null),
  expectedTotal: z.number().int().min(0),
})
export type CheckoutInput = z.output<typeof checkoutSchema>

export const checkoutPreviewSchema = z.object({
  shippingMethod: z.enum(SHIPPING_METHODS).default('STANDARD'),
  paymentMethod: z.enum(PAYMENT_METHODS).nullish(),
})

export const cancelOrderSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(300, { error: 'tooLong' })
    .nullish()
    .transform((value) => value || null),
})
