import { z } from 'zod'
import { adminWriteLimit } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { created } from '@/lib/api/responses'
import { productSchema, variantCreateSchema } from '@/schemas/admin-catalog'
import { createProduct } from '@/services/admin/products.service'

const schema = z.object({ product: productSchema, firstVariant: variantCreateSchema })

/** Create a product with its first variant (and opening stock). New products start as drafts. */
export const POST = apiHandler(
  { auth: 'staff', permission: 'PRODUCTS_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const input = await ctx.body(schema)
    const product = await createProduct(input.product, input.firstVariant, ctx.audit)
    return created({ product })
  },
)
