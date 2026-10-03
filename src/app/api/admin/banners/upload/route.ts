import { apiHandler } from '@/lib/api/handler'
import { created } from '@/lib/api/responses'
import { readSingleUpload } from '@/lib/api/upload'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { uploadBannerImage } from '@/services/admin/content.service'

/** Upload a banner image; returns its URL and storage key for the banner form. */
export const POST = apiHandler(
  {
    auth: 'staff',
    permission: 'CONTENT_MANAGE',
    rateLimit: (ctx) => [{ rule: RATE_LIMITS.uploads, subject: ctx.user?.id ?? ctx.ip }],
  },
  async (ctx) => {
    const { bytes } = await readSingleUpload(ctx.req)
    return created({ image: await uploadBannerImage(bytes, ctx.audit) })
  },
)
