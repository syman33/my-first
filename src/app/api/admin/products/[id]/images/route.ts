import { routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { created } from '@/lib/api/responses'
import { AppError, NotFoundError } from '@/lib/errors'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { imageMetaSchema } from '@/schemas/admin-catalog'
import { addProductImage } from '@/services/admin/product-images.service'
import { MAX_UPLOAD_BYTES } from '@/services/media/image-processing.service'

/** Multipart form overhead allowed on top of the file itself. */
const FORM_OVERHEAD = 64 * 1024

/**
 * Upload a product image (multipart field `file`, optional `altAr`/`altEn`).
 * The declared size is checked before the body is read; the bytes are then
 * sniffed, decoded and re-encoded server-side — the client's file name and
 * type are never trusted.
 */
export const POST = apiHandler<{ id: string }>(
  {
    auth: 'staff',
    permission: 'PRODUCTS_MANAGE',
    rateLimit: (ctx) => [{ rule: RATE_LIMITS.uploads, subject: ctx.user?.id ?? ctx.ip }],
  },
  async (ctx) => {
    const id = routeId(ctx.params.id, new NotFoundError('PRODUCT_NOT_FOUND', 'Product not found'))
    const contentType = ctx.req.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Expected multipart/form-data', { status: 415 })
    }
    const declared = Number(ctx.req.headers.get('content-length') ?? 'NaN')
    if (!Number.isFinite(declared) || declared > MAX_UPLOAD_BYTES + FORM_OVERHEAD) {
      throw new AppError('PAYLOAD_TOO_LARGE', 'Upload too large', {
        status: 413,
        details: { reason: 'TOO_LARGE' },
      })
    }
    const form = await ctx.req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      throw new AppError('UPLOAD_REJECTED', 'No file received', {
        status: 422,
        details: { reason: 'EMPTY' },
      })
    }
    const alt = imageMetaSchema.parse({ altAr: form.get('altAr'), altEn: form.get('altEn') })
    const bytes = new Uint8Array(await file.arrayBuffer())
    return created({ image: await addProductImage(id, bytes, alt, ctx.audit) })
  },
)
