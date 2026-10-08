import 'server-only'
import type { DbClient } from '@/db/client'
import type { ActorType, InventoryMovementType } from '@/generated/prisma/enums'
import { AppError, InsufficientStockError, type StockShortage } from '@/lib/errors'

/**
 * Concurrency-safe stock movements. Every change is a single conditional
 * UPDATE (`… WHERE on_hand - reserved >= qty`), so two buyers racing for the
 * last unit cannot both win: PostgreSQL row locks serialise the updates and
 * the loser's WHERE clause no longer matches. CHECK constraints
 * (on_hand ≥ 0, 0 ≤ reserved ≤ on_hand) are the last line of defence.
 * Each movement is written to the inventory ledger in the same transaction.
 *
 * All functions must run inside the caller's transaction.
 */

export interface StockLine {
  variantId: string
  sku: string
  quantity: number
}

export interface MovementContext {
  orderId?: string | null
  returnRequestId?: string | null
  reason: string
  actorType: ActorType
  actorId?: string | null
}

interface StockRow {
  on_hand: number
  reserved: number
}

/** Lock order: always touch variants in id order so concurrent multi-item checkouts cannot deadlock. */
function sorted(lines: readonly StockLine[]): StockLine[] {
  const merged = new Map<string, StockLine>()
  for (const line of lines) {
    const existing = merged.get(line.variantId)
    merged.set(
      line.variantId,
      existing ? { ...existing, quantity: existing.quantity + line.quantity } : { ...line },
    )
  }
  return [...merged.values()].sort((a, b) =>
    a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0,
  )
}

async function ledger(
  tx: DbClient,
  line: StockLine,
  type: InventoryMovementType,
  after: StockRow,
  deltas: { onHand: number; reserved: number },
  ctx: MovementContext,
): Promise<void> {
  await tx.inventoryTransaction.create({
    data: {
      variantId: line.variantId,
      type,
      quantityDelta: deltas.onHand,
      reservedDelta: deltas.reserved,
      previousOnHand: after.on_hand - deltas.onHand,
      newOnHand: after.on_hand,
      previousReserved: after.reserved - deltas.reserved,
      newReserved: after.reserved,
      reason: ctx.reason,
      orderId: ctx.orderId ?? null,
      returnRequestId: ctx.returnRequestId ?? null,
      actorType: ctx.actorType,
      actorId: ctx.actorId ?? null,
    },
  })
}

async function availableFor(tx: DbClient, variantId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ available: number }[]>`
    SELECT GREATEST(on_hand - reserved, 0)::int AS available FROM inventory WHERE variant_id = ${variantId}::uuid`
  return rows[0]?.available ?? 0
}

/**
 * Hold stock for an order. Either every line is reserved or the whole
 * transaction fails with the full list of shortages.
 */
export async function reserveStock(
  tx: DbClient,
  lines: readonly StockLine[],
  ctx: MovementContext,
): Promise<void> {
  const shortages: StockShortage[] = []
  const reserved: { line: StockLine; row: StockRow }[] = []
  for (const line of sorted(lines)) {
    const rows = await tx.$queryRaw<StockRow[]>`
      UPDATE inventory
         SET reserved = reserved + ${line.quantity}, updated_at = now()
       WHERE variant_id = ${line.variantId}::uuid
         AND on_hand - reserved >= ${line.quantity}
      RETURNING on_hand, reserved`
    const row = rows[0]
    if (!row) {
      shortages.push({
        ...line,
        requested: line.quantity,
        available: await availableFor(tx, line.variantId),
      })
      continue
    }
    reserved.push({ line, row })
  }
  if (shortages.length > 0) throw new InsufficientStockError(shortages)
  for (const { line, row } of reserved) {
    await ledger(tx, line, 'RESERVATION', row, { onHand: 0, reserved: line.quantity }, ctx)
  }
}

/** Give reserved stock back (cancelled or expired unpaid order). */
export async function releaseReservation(
  tx: DbClient,
  lines: readonly StockLine[],
  ctx: MovementContext,
): Promise<void> {
  for (const line of sorted(lines)) {
    const rows = await tx.$queryRaw<StockRow[]>`
      UPDATE inventory
         SET reserved = reserved - ${line.quantity}, updated_at = now()
       WHERE variant_id = ${line.variantId}::uuid AND reserved >= ${line.quantity}
      RETURNING on_hand, reserved`
    const row = rows[0]
    if (!row)
      throw new AppError('CONFLICT', `Reservation for ${line.sku} is not held`, { status: 409 })
    await ledger(tx, line, 'RESERVATION_RELEASE', row, { onHand: 0, reserved: -line.quantity }, ctx)
  }
}

/** Turn a reservation into a sale (payment captured or COD order confirmed). */
export async function commitReservation(
  tx: DbClient,
  lines: readonly StockLine[],
  ctx: MovementContext,
): Promise<void> {
  for (const line of sorted(lines)) {
    const rows = await tx.$queryRaw<StockRow[]>`
      UPDATE inventory
         SET on_hand = on_hand - ${line.quantity}, reserved = reserved - ${line.quantity}, updated_at = now()
       WHERE variant_id = ${line.variantId}::uuid
         AND reserved >= ${line.quantity}
         AND on_hand >= ${line.quantity}
      RETURNING on_hand, reserved`
    const row = rows[0]
    if (!row)
      throw new AppError('CONFLICT', `Reservation for ${line.sku} is not held`, { status: 409 })
    await ledger(tx, line, 'SALE', row, { onHand: -line.quantity, reserved: -line.quantity }, ctx)
  }
}

/**
 * Put sold units back on the shelf. Used only when the goods are physically
 * in the warehouse: a cancelled order that never shipped, or a return that
 * was received and inspected as sellable (spec §106).
 */
export async function restock(
  tx: DbClient,
  lines: readonly StockLine[],
  type: 'CANCELLATION_RESTOCK' | 'RETURN_RESTOCK',
  ctx: MovementContext,
): Promise<void> {
  for (const line of sorted(lines)) {
    const rows = await tx.$queryRaw<StockRow[]>`
      UPDATE inventory
         SET on_hand = on_hand + ${line.quantity}, updated_at = now()
       WHERE variant_id = ${line.variantId}::uuid
      RETURNING on_hand, reserved`
    const row = rows[0]
    if (!row)
      throw new AppError('NOT_FOUND', `No inventory record for ${line.sku}`, { status: 404 })
    await ledger(tx, line, type, row, { onHand: line.quantity, reserved: 0 }, ctx)
  }
}

/**
 * Staff stock change (goods received, damage written off, count corrected).
 * On-hand may never drop below what is reserved for open orders, nor below
 * zero; the change and its reason go to the ledger.
 */
export async function adjustStock(
  tx: DbClient,
  line: StockLine & { delta: number },
  type: 'RESTOCK' | 'DAMAGE_WRITE_OFF' | 'MANUAL_ADJUSTMENT' | 'IMPORT',
  ctx: MovementContext,
): Promise<{ onHand: number; reserved: number }> {
  if (!Number.isInteger(line.delta) || line.delta === 0) {
    throw new AppError('VALIDATION_ERROR', 'Stock change must be a non-zero whole number', {
      status: 422,
    })
  }
  const rows = await tx.$queryRaw<StockRow[]>`
    UPDATE inventory
       SET on_hand = on_hand + ${line.delta}, updated_at = now()
     WHERE variant_id = ${line.variantId}::uuid
       AND on_hand + ${line.delta} >= reserved
       AND on_hand + ${line.delta} >= 0
    RETURNING on_hand, reserved`
  const row = rows[0]
  if (!row) {
    throw new AppError(
      'CONFLICT',
      `Stock for ${line.sku} cannot go below the units reserved for open orders`,
      {
        status: 409,
        details: { reason: 'BELOW_RESERVED', available: await availableFor(tx, line.variantId) },
      },
    )
  }
  await ledger(tx, line, type, row, { onHand: line.delta, reserved: 0 }, ctx)
  return { onHand: row.on_hand, reserved: row.reserved }
}
