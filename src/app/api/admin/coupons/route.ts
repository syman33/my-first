import { adminWriteLimit } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { created } from '@/lib/api/responses'
import { couponSchema } from '@/schemas/admin-content'
import { saveCoupon } from '@/services/admin/content.service'

export const POST = apiHandler(
  { auth: 'staff', permission: 'COUPONS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) =>
    created({ coupon: await saveCoupon(null, await ctx.body(couponSchema), ctx.audit) }),
)
