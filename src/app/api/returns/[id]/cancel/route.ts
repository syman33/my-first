import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { NotFoundError } from '@/lib/errors'
import { uuidField } from '@/schemas/common'
import { cancelReturn } from '@/services/orders/returns.service'

/** A customer withdraws their own return request while it is still under review. */
export const POST = apiHandler<{ id: string }>({ auth: 'user' }, async (ctx) => {
  const id = uuidField.safeParse(ctx.params.id)
  if (!id.success) throw new NotFoundError('NOT_FOUND', 'Return not found')
  await cancelReturn(id.data, { audit: ctx.audit, byCustomerId: ctx.user.id })
  return ok({ cancelled: true })
})
