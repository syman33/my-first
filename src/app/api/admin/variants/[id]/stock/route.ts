import { adminWriteLimit, routeId } from '@/lib/api/admin'
import { apiHandler } from '@/lib/api/handler'
import { ok } from '@/lib/api/responses'
import { NotFoundError } from '@/lib/errors'
import { inventoryAdjustmentSchema } from '@/schemas/admin-catalog'
import { applyInventoryAdjustment } from '@/services/admin/inventory.service'

/** Receive stock, write off damage or correct to a physical count — always with a reason. */
export const POST = apiHandler<{ id: string }>(
  { auth: 'staff', permission: 'INVENTORY_ADJUST', rateLimit: adminWriteLimit },
  async (ctx) => {
    const id = routeId(ctx.params.id, new NotFoundError('VARIANT_NOT_FOUND', 'Variant not found'))
    const input = await ctx.body(inventoryAdjustmentSchema)
    return ok({ stock: await applyInventoryAdjustment(id, input, ctx.audit) })
  },
)
