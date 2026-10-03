import { adminWriteLimit } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { NotFoundError } from '@/lib/errors'
import { pageSchema } from '@/schemas/admin-content'
import { savePage } from '@/services/admin/content.service'

export const PUT = apiHandler<{ slug: string }>(
  { auth: 'staff', permission: 'CONTENT_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const slug = ctx.params.slug
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw new NotFoundError()
    await savePage(slug, await ctx.body(pageSchema), ctx.audit)
    return ok({ updated: true })
  },
)
