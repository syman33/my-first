import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { noContent, ok } from '@/lib/api/responses'
import { imageMetaSchema } from '@/schemas/admin-catalog'
import { deleteProductImage, updateProductImage } from '@/services/admin/product-images.service'

export const PATCH = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'PRODUCTS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id)
    await updateProductImage(id, await ctx.body(imageMetaSchema), ctx.audit)
    return ok({ updated: true })
  },
)

export const DELETE = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'PRODUCTS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    await deleteProductImage(routeId(ctx.params.id), ctx.audit)
    return noContent()
  },
)
