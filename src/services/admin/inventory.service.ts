import 'server-only'
import { prisma } from '@/db/client'
import { Prisma } from '@/generated/prisma/client'
import { NotFoundError } from '@/lib/errors'
import type { InventoryAdjustmentInput } from '@/schemas/admin-catalog'
import { type AuditContext, recordAudit } from '@/services/audit/audit.service'
import { adjustStock } from '@/services/inventory/inventory.service'
import type { InventoryMovementView, InventoryRow } from '@/types/admin-catalog'

/** Stock levels per variant, adjustments with a reason, and the movement ledger. */

export interface InventoryFilters {
  q?: string
  stock?: 'low' | 'out'
}

export async function listInventory(
  filters: InventoryFilters,
  page: number,
  pageSize: number,
): Promise<{ rows: InventoryRow[]; total: number }> {
  const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`]
  if (filters.q) {
    const like = `%${filters.q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
    conditions.push(
      Prisma.sql`(v.sku ILIKE ${like} OR p.sku ILIKE ${like} OR p.name_ar ILIKE ${like} OR p.name_en ILIKE ${like})`,
    )
  }
  if (filters.stock === 'out') conditions.push(Prisma.sql`i.on_hand - i.reserved <= 0`)
  if (filters.stock === 'low')
    conditions.push(
      Prisma.sql`i.on_hand - i.reserved <= COALESCE(i.low_stock_threshold, p.low_stock_threshold)`,
    )
  const where = Prisma.join(conditions, ' AND ')
  const [count, rows] = await Promise.all([
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n
        FROM inventory i
        JOIN product_variants v ON v.id = i.variant_id
        JOIN products p ON p.id = v.product_id
       WHERE ${where}`,
    prisma.$queryRaw<
      {
        variant_id: string
        product_id: string
        product_name_ar: string
        product_name_en: string
        variant_name_ar: string
        variant_name_en: string
        sku: string
        on_hand: number
        reserved: number
        threshold: number
        is_active: boolean
        product_status: InventoryRow['productStatus']
      }[]
    >`
      SELECT v.id AS variant_id, p.id AS product_id,
             p.name_ar AS product_name_ar, p.name_en AS product_name_en,
             v.name_ar AS variant_name_ar, v.name_en AS variant_name_en,
             v.sku, i.on_hand, i.reserved,
             COALESCE(i.low_stock_threshold, p.low_stock_threshold) AS threshold,
             v.is_active, p.status::text AS product_status
        FROM inventory i
        JOIN product_variants v ON v.id = i.variant_id
        JOIN products p ON p.id = v.product_id
       WHERE ${where}
       ORDER BY (i.on_hand - i.reserved) ASC, v.sku ASC
       LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
  ])
  return {
    total: Number(count[0]?.n ?? 0n),
    rows: rows.map((row) => ({
      variantId: row.variant_id,
      productId: row.product_id,
      productNameAr: row.product_name_ar,
      productNameEn: row.product_name_en,
      variantNameAr: row.variant_name_ar,
      variantNameEn: row.variant_name_en,
      sku: row.sku,
      onHand: row.on_hand,
      reserved: row.reserved,
      available: Math.max(row.on_hand - row.reserved, 0),
      threshold: row.threshold,
      isActive: row.is_active,
      productStatus: row.product_status,
    })),
  }
}

export async function getVariantStock(variantId: string) {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      sku: true,
      nameAr: true,
      nameEn: true,
      product: { select: { id: true, nameAr: true, nameEn: true, lowStockThreshold: true } },
      inventory: true,
    },
  })
  if (!variant || !variant.inventory)
    throw new NotFoundError('VARIANT_NOT_FOUND', 'Variant not found')
  return variant
}

export async function listMovements(
  variantId: string,
  limit = 100,
): Promise<InventoryMovementView[]> {
  const movements = await prisma.inventoryTransaction.findMany({
    where: { variantId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { actor: { select: { name: true } } },
  })
  return movements.map((movement) => ({
    id: movement.id,
    type: movement.type,
    quantityDelta: movement.quantityDelta,
    reservedDelta: movement.reservedDelta,
    newOnHand: movement.newOnHand,
    newReserved: movement.newReserved,
    reason: movement.reason,
    orderId: movement.orderId,
    actorName: movement.actor?.name ?? null,
    createdAt: movement.createdAt,
  }))
}

/**
 * Apply a staff stock change. A count correction is turned into the exact
 * delta under a row lock, so a sale landing at the same moment is not lost.
 */
export async function applyInventoryAdjustment(
  variantId: string,
  input: InventoryAdjustmentInput,
  audit: AuditContext,
): Promise<{ onHand: number; reserved: number; delta: number }> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ on_hand: number; reserved: number; sku: string }[]>`
      SELECT i.on_hand, i.reserved, v.sku
        FROM inventory i JOIN product_variants v ON v.id = i.variant_id
       WHERE i.variant_id = ${variantId}::uuid
       FOR UPDATE OF i`
    const current = rows[0]
    if (!current) throw new NotFoundError('VARIANT_NOT_FOUND', 'Variant not found')
    const delta =
      input.type === 'RESTOCK'
        ? input.quantity
        : input.type === 'DAMAGE_WRITE_OFF'
          ? -input.quantity
          : input.counted - current.on_hand
    // Counted exactly what the system holds: nothing to record.
    if (delta === 0) return { onHand: current.on_hand, reserved: current.reserved, delta: 0 }
    const type = input.type === 'COUNT' ? 'MANUAL_ADJUSTMENT' : input.type
    const result = await adjustStock(
      tx,
      { variantId, sku: current.sku, quantity: Math.abs(delta), delta },
      type,
      { reason: input.reason, actorType: audit.actor.type, actorId: audit.actor.id },
    )
    await recordAudit(tx, audit, {
      action: `inventory.${type.toLowerCase()}`,
      entityType: 'variant',
      entityId: variantId,
      metadata: { sku: current.sku, delta, onHand: result.onHand, reason: input.reason },
    })
    return { ...result, delta }
  })
}
