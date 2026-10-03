import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { noContent, ok } from '@/lib/api/responses'
import { NotFoundError } from '@/lib/errors'
import { productSchema } from '@/schemas/admin-catalog'
import { deleteProduct, updateProduct } from '@/services/admin/products.service'

const notFound = () => new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found')

export const PUT = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'PRODUCTS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id, notFound())
    const input = await ctx.body(productSchema)
    await updateProduct(id, input, ctx.audit)
    return ok({ updated: true })
  },
)

/** Permanent deletion is for products never ordered; everything else is archived. */
export const DELETE = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'PRODUCTS_DELETE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id, notFound())
    await deleteProduct(id, ctx.audit)
    return noContent()
  },
)
