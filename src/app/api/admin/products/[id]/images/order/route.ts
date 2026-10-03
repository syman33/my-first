import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { NotFoundError } from '@/lib/errors'
import { imageOrderSchema } from '@/schemas/admin-catalog'
import { reorderProductImages } from '@/services/admin/product-images.service'

/** Set the gallery order (the first image is the product's main photo). */
export const PUT = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'PRODUCTS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id, new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found'))
    const { imageIds } = await ctx.body(imageOrderSchema)
    await reorderProductImages(id, imageIds, ctx.audit)
    return ok({ updated: true })
  },
)
