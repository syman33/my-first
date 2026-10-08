import * as z from 'zod'

export const reviewSubmissionSchema = z.object({
  rating: z
    .number({ error: 'rating' })
    .int({ error: 'rating' })
    .min(1, { error: 'rating' })
    .max(5, { error: 'rating' }),
  title: z
    .string()
    .trim()
    .max(120, { error: 'tooLong' })
    .nullish()
    .transform((value) => value || null),
  body: z
    .string({ error: 'required' })
    .trim()
    .min(10, { error: 'tooShort' })
    .max(2000, { error: 'tooLong' }),
})
export type ReviewSubmission = z.output<typeof reviewSubmissionSchema>

export const reviewModerationSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    reason: z
      .string()
      .trim()
      .max(300, { error: 'tooLong' })
      .nullish()
      .transform((value) => value || null),
  })
  .refine((value) => value.decision === 'APPROVED' || value.reason !== null, {
    path: ['reason'],
    error: 'required',
  })
