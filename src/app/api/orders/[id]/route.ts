import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { OrderNotFoundError } from '@/lib/errors'
import { uuidField } from '@/schemas/common'
import { getCustomerOrder } from '@/services/orders/order-query.service'

export const GET = apiHandler<{ id: string }>({ auth: 'user' }, async (ctx) => {
  const id = uuidField.safeParse(ctx.params.id)
  if (!id.success) throw new OrderNotFoundError()
  return ok({ order: await getCustomerOrder(ctx.user.id, id.data, ctx.locale) })
})
