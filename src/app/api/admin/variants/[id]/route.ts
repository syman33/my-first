import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { NotFoundError } from '@/lib/errors'
import { variantSchema } from '@/schemas/admin-catalog'
import { updateVariant } from '@/services/admin/products.service'

export const PUT = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'PRODUCTS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id, new NotFoundError('VARIANT_NOT_FOUND', 'Variant not found'))
    const input = await ctx.body(variantSchema)
    await updateVariant(id, input, ctx.audit)
    return ok({ updated: true })
  },
)
