import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { created } from '@/lib/api/responses'
import { NotFoundError } from '@/lib/errors'
import { variantCreateSchema } from '@/schemas/admin-catalog'
import { addVariant } from '@/services/admin/products.service'

export const POST = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'PRODUCTS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id, new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found'))
    const input = await ctx.body(variantCreateSchema)
    return created({ variant: await addVariant(id, input, ctx.audit) })
  },
)
