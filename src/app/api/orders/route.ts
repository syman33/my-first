import { z } from 'zod'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { listCustomerOrders } from '@/services/orders/order-query.service'

const querySchema = z.object({ page: z.coerce.number().int().min(1).max(500).default(1) })

export const GET = apiHandler({ auth: 'user' }, async (ctx) => {
  const { page } = ctx.query(querySchema)
  return ok(await listCustomerOrders(ctx.user.id, page))
})
