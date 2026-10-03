import { adminWriteLimit } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { created } from '@/lib/api/responses'
import { categorySchema } from '@/schemas/admin-catalog'
import { saveCategory } from '@/services/admin/categories.service'

export const POST = apiHandler(
  { auth: 'staff', permission: 'CATALOG_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) =>
    created({ category: await saveCategory(null, await ctx.body(categorySchema), ctx.audit) }),
)
