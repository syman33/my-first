import { adminWriteLimit } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { created } from '@/lib/api/responses'
import { bannerSchema } from '@/schemas/admin-content'
import { saveBanner } from '@/services/admin/content.service'

export const POST = apiHandler(
  { auth: 'staff', permission: 'CONTENT_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) =>
    created({ banner: await saveBanner(null, await ctx.body(bannerSchema), ctx.audit) }),
)
