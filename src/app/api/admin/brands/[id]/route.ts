import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { noContent, ok } from '@/lib/api/responses'
import { brandSchema } from '@/schemas/admin-catalog'
import { deleteBrand, saveBrand } from '@/services/admin/categories.service'

export const PUT = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'CATALOG_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id)
    return ok({ brand: await saveBrand(id, await ctx.body(brandSchema), ctx.audit) })
  },
)

export const DELETE = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'CATALOG_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => {
    await deleteBrand(routeId(ctx.params.id), ctx.audit)
    return noContent()
  },
)
