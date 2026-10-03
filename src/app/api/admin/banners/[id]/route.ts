import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { noContent, ok } from '@/lib/api/responses'
import { bannerSchema } from '@/schemas/admin-content'
import { deleteBanner, saveBanner } from '@/services/admin/content.service'

export const PUT = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'CONTENT_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id)
    return ok({ banner: await saveBanner(id, await ctx.body(bannerSchema), ctx.audit) })
  },
)

export const DELETE = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'CONTENT_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    await deleteBanner(routeId(ctx.params.id), ctx.audit)
    return noContent()
  },
)
