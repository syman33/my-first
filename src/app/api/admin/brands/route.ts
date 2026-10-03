import { adminWriteLimit } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { created } from '@/lib/api/responses'
import { brandSchema } from '@/schemas/admin-catalog'
import { saveBrand } from '@/services/admin/categories.service'

export const POST = apiHandler(
  { auth: 'staff', permission: 'CATALOG_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => created({ brand: await saveBrand(null, await ctx.body(brandSchema), ctx.audit) }),
)
