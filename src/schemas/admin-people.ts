import { z } from 'zod'

export const customerStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z
    .string({ error: 'required' })
    .trim()
    .min(3, { error: 'tooShort' })
    .max(300, { error: 'tooLong' }),
})

export const messageStatusSchema = z.object({ status: z.enum(['NEW', 'READ', 'ARCHIVED']) })
