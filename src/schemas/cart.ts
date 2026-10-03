import { z } from 'zod'
import { uuidField } from './common'

const quantity = z.coerce.number({ error: 'quantity' }).int({ error: 'quantity' })

export const addToCartSchema = z.object({
  variantId: uuidField,
  quantity: quantity.min(1, { error: 'quantity' }).max(99, { error: 'quantity' }).default(1),
})

/** 0 removes the line. */
export const updateCartItemSchema = z.object({
  quantity: quantity.min(0, { error: 'quantity' }).max(99, { error: 'quantity' }),
})

export const applyCouponSchema = z.object({
  code: z
    .string({ error: 'required' })
    .trim()
    .min(1, { error: 'required' })
    .max(40, { error: 'tooLong' }),
})

export const wishlistItemSchema = z.object({
  productId: uuidField,
  variantId: uuidField.nullish(),
})

export const moveToCartSchema = z.object({ variantId: uuidField.nullish() })
