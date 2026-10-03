import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { noContent, ok } from '@/lib/api/responses'
import { categorySchema } from '@/schemas/admin-catalog'
import { deleteCategory, saveCategory } from '@/services/admin/categories.service'

export const PUT = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'CATALOG_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id)
    return ok({ category: await saveCategory(id, await ctx.body(categorySchema), ctx.audit) })
  },
)

export const DELETE = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'CATALOG_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    await deleteCategory(routeId(ctx.params.id), ctx.audit)
    return noContent()
  },
)
