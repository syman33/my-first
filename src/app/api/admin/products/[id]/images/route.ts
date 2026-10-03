import { routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { created } from '@/lib/api/responses'
import { readSingleUpload } from '@/lib/api/upload'
import { NotFoundError } from '@/lib/errors'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { imageMetaSchema } from '@/schemas/admin-catalog'
import { addProductImage } from '@/services/admin/product-images.service'

/**
 * Upload a product image (multipart field `file`, optional `altAr`/`altEn`).
 * The bytes are sniffed, decoded and re-encoded server-side — the client's
 * file name and type are never trusted.
 */
export const POST = apiHandler<{ id: string }>(
  {
    auth: 'staff',
    permission: 'PRODUCTS_MANAGE',
    rateLimit: (ctx) => [{ rule: RATE_LIMITS.uploads, subject: ctx.user?.id ?? ctx.ip }],
  },
  async (ctx) => {
    const id = routeId(ctx.params.id, new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found'))
    const { bytes, form } = await readSingleUpload(ctx.req)
    const alt = imageMetaSchema.parse({ altAr: form.get('altAr'), altEn: form.get('altEn') })
    return created({ image: await addProductImage(id, bytes, alt, ctx.audit) })
  },
)
