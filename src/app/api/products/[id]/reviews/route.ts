import { routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { created } from '@/lib/api/responses'
import { NotFoundError } from '@/lib/errors'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { reviewSubmissionSchema } from '@/schemas/reviews'
import { submitReview } from '@/services/reviews/review.service'

/** Write a review. Eligibility (signed in, bought it, not yet reviewed) is decided here, not in the UI. */
export const POST = apiHandler<{ id: string }>(
  {
    auth: 'user',
    rateLimit: (ctx) => [{ rule: RATE_LIMITS.reviews, subject: ctx.user?.id ?? ctx.ip }],
  },
  async (ctx) => {
    const productId = routeId(
      ctx.params.id,
      new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found'),
    )
    const input = await ctx.body(reviewSubmissionSchema)
    const review = await submitReview(ctx.user.id, productId, input, ctx.locale, ctx.audit)
    return created({ review })
  },
)
