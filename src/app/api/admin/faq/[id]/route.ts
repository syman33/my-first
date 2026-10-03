import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { noContent, ok } from '@/lib/api/responses'
import { faqSchema } from '@/schemas/admin-content'
import { deleteFaq, saveFaq } from '@/services/admin/content.service'

export const PUT = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'CONTENT_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id)
    return ok({ faq: await saveFaq(id, await ctx.body(faqSchema), ctx.audit) })
  },
)

export const DELETE = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'CONTENT_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    await deleteFaq(routeId(ctx.params.id), ctx.audit)
    return noContent()
  },
)
