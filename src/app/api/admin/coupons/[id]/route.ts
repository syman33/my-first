import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { noContent, ok } from '@/lib/api/responses'
import { couponSchema } from '@/schemas/admin-content'
import { deleteCoupon, saveCoupon } from '@/services/admin/content.service'

export const PUT = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'COUPONS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id)
    return ok({ coupon: await saveCoupon(id, await ctx.body(couponSchema), ctx.audit) })
  },
)

export const DELETE = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'COUPONS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    await deleteCoupon(routeId(ctx.params.id), ctx.audit)
    return noContent()
  },
)
