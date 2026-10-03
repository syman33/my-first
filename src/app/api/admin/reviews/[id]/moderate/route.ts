import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { reviewModerationSchema } from '@/schemas/reviews'
import { moderateReview } from '@/services/reviews/review.service'

/** Approve or reject a review (the product's rating is recalculated from approved reviews). */
export const POST = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'REVIEWS_MODERATE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id)
    const input = await ctx.body(reviewModerationSchema)
    await moderateReview(id, input, ctx.audit)
    return ok({ status: input.decision })
  },
)
