import 'server-only'
import { prisma } from '@/db/client'
import type { Prisma } from '@/generated/prisma/client'
import type { ReturnStatus } from '@/generated/prisma/enums'
import { NotFoundError } from '@/lib/errors'
import type { AdminReturnDetail, AdminReturnRow } from '@/types/admin-orders'

/** Back-office return queries. State changes live in services/orders/returns.service.ts. */

export interface AdminReturnFilters {
  q?: string
  status?: ReturnStatus
}

function returnWhere(filters: AdminReturnFilters): Prisma.ReturnRequestWhereInput {
  const and: Prisma.ReturnRequestWhereInput[] = []
  if (filters.q) {
    const q = filters.q
    and.push({
      OR: [
        { returnNumber: { contains: q, mode: 'insensitive' } },
        { order: { orderNumber: { contains: q, mode: 'insensitive' } } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
        { user: { name: { contains: q, mode: 'insensitive' } } },
      ],
    })
  }
  if (filters.status) and.push({ status: filters.status })
  return and.length > 0 ? { AND: and } : {}
}

export async function listAdminReturns(
  filters: AdminReturnFilters,
  page: number,
  pageSize: number,
): Promise<{ rows: AdminReturnRow[]; total: number }> {
  const where = returnWhere(filters)
  const [total, rows] = await prisma.$transaction([
    prisma.returnRequest.count({ where }),
    prisma.returnRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        returnNumber: true,
        status: true,
        reason: true,
        createdAt: true,
        order: { select: { id: true, orderNumber: true } },
        user: { select: { name: true, email: true } },
        items: { select: { quantity: true } },
      },
    }),
  ])
  return {
    total,
    rows: rows.map((row) => ({
      id: row.id,
      returnNumber: row.returnNumber,
      status: row.status,
      reason: row.reason,
      createdAt: row.createdAt,
      orderId: row.order.id,
      orderNumber: row.order.orderNumber,
      customerName: row.user.name,
      customerEmail: row.user.email,
      units: row.items.reduce((sum, item) => sum + item.quantity, 0),
    })),
  }
}

export async function getAdminReturn(returnId: string): Promise<AdminReturnDetail> {
  const request = await prisma.returnRequest.findUnique({
    where: { id: returnId },
    include: {
      order: { select: { id: true, orderNumber: true, paymentMethod: true, deliveredAt: true } },
      user: { select: { id: true, name: true, email: true, phone: true } },
      reviewedBy: { select: { name: true } },
      items: { include: { orderItem: true }, orderBy: { id: 'asc' } },
      refunds: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!request) throw new NotFoundError('NOT_FOUND', 'Return not found')
  return {
    id: request.id,
    returnNumber: request.returnNumber,
    status: request.status,
    reason: request.reason,
    customerNote: request.customerNote,
    adminNote: request.adminNote,
    createdAt: request.createdAt,
    reviewedAt: request.reviewedAt,
    reviewedBy: request.reviewedBy?.name ?? null,
    receivedAt: request.receivedAt,
    completedAt: request.completedAt,
    order: request.order,
    customer: request.user,
    items: request.items.map((item) => ({
      id: item.id,
      orderItemId: item.orderItemId,
      nameAr: item.orderItem.productNameAr,
      nameEn: item.orderItem.productNameEn,
      variantNameAr: item.orderItem.variantNameAr,
      variantNameEn: item.orderItem.variantNameEn,
      sku: item.orderItem.sku,
      imageUrl: item.orderItem.imageUrl,
      quantity: item.quantity,
      purchasedQuantity: item.orderItem.quantity,
      condition: item.condition,
      restockedQuantity: item.restockedQuantity,
    })),
    refunds: request.refunds.map((refund) => ({
      id: refund.id,
      amount: refund.amount,
      status: refund.status,
      reference: refund.providerRefundId,
      createdAt: refund.createdAt,
    })),
  }
}
