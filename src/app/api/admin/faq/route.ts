import { adminWriteLimit } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { created } from '@/lib/api/responses'
import { faqSchema } from '@/schemas/admin-content'
import { saveFaq } from '@/services/admin/content.service'

export const POST = apiHandler(
  { auth: 'staff', permission: 'CONTENT_MANAGE', rateLimit: adminWriteLimit },
  async (ctx) => created({ faq: await saveFaq(null, await ctx.body(faqSchema), ctx.audit) }),
)
