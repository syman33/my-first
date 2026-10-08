import 'server-only'
import { prisma } from '@/db/client'
import type { Prisma } from '@/generated/prisma/client'
import type { OrderStatus } from '@/generated/prisma/enums'
import { type CatalogCsvRow, catalogExportRows } from '@/lib/admin/catalog-csv'
import { AppError } from '@/lib/errors'
import { type AuditContext, recordAudit } from '@/services/audit/audit.service'
import { halalasToSarString } from '@/utils/money'
import { formatSaudiMobile } from '@/utils/phone'
import { toStoreDateTimeLocal } from '@/utils/time'

/** CSV exports for the back office. Each export is audited (they contain business and personal data). */

export const MAX_ORDER_EXPORT_ROWS = 20_000

/** The whole catalogue, one row per variant, in the import format. */
export async function exportCatalog(audit: AuditContext): Promise<CatalogCsvRow[]> {
  const products = await prisma.product.findMany({
    orderBy: { sku: 'asc' },
    include: {
      category: { select: { slug: true } },
      brand: { select: { slug: true } },
      variants: {
        orderBy: [{ sortOrder: 'asc' }, { sku: 'asc' }],
        include: { inventory: { select: { onHand: true, reserved: true } } },
      },
    },
  })
  const rows = catalogExportRows(
    products.map((product) => ({
      sku: product.sku,
      nameAr: product.nameAr,
      nameEn: product.nameEn,
      slugAr: product.slugAr,
      slugEn: product.slugEn,
      descriptionAr: product.descriptionAr,
      descriptionEn: product.descriptionEn,
      categorySlug: product.category.slug,
      brandSlug: product.brand?.slug ?? null,
      gender: product.gender,
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      materialAr: product.materialAr,
      materialEn: product.materialEn,
      status: product.status,
      variants: product.variants.map((variant) => ({
        sku: variant.sku,
        nameAr: variant.nameAr,
        nameEn: variant.nameEn,
        colorFamily: variant.colorFamily,
        colorNameAr: variant.colorNameAr,
        colorNameEn: variant.colorNameEn,
        colorHex: variant.colorHex,
        size: variant.size,
        price: variant.price,
        compareAtPrice: variant.compareAtPrice,
        barcode: variant.barcode,
        isActive: variant.isActive,
        onHand: variant.inventory?.onHand ?? 0,
        reserved: variant.inventory?.reserved ?? 0,
      })),
    })),
  )
  await recordAudit(prisma, audit, {
    action: 'catalog.exported',
    entityType: 'catalog',
    metadata: { products: products.length, rows: rows.length },
  })
  return rows
}

export interface OrderExportFilters {
  from?: Date
  /** Exclusive upper bound. */
  to?: Date
  status?: OrderStatus
}

export const ORDER_EXPORT_COLUMNS = [
  'order_number',
  'placed_at',
  'status',
  'payment_status',
  'payment_method',
  'shipping_method',
  'customer_name',
  'customer_email',
  'customer_phone',
  'city',
  'district',
  'items',
  'subtotal',
  'discount',
  'shipping',
  'cod_fee',
  'vat',
  'total',
  'refunded',
  'coupon',
] as const
export type OrderExportRow = Record<(typeof ORDER_EXPORT_COLUMNS)[number], string | number>

/** Orders for accounting: amounts in SAR, times in store time (Riyadh). */
export async function exportOrders(
  filters: OrderExportFilters,
  audit: AuditContext,
): Promise<OrderExportRow[]> {
  const where: Prisma.OrderWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lt: filters.to } : {}),
          },
        }
      : {}),
  }
  const count = await prisma.order.count({ where })
  if (count > MAX_ORDER_EXPORT_ROWS) {
    throw new AppError('BAD_REQUEST', 'Too many orders for one export', {
      status: 422,
      details: { reason: 'TOO_MANY_ROWS', limit: MAX_ORDER_EXPORT_ROWS, count },
    })
  }
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    select: {
      orderNumber: true,
      createdAt: true,
      status: true,
      paymentStatus: true,
      paymentMethod: true,
      shippingMethod: true,
      shippingName: true,
      shippingEmail: true,
      shippingPhone: true,
      shippingCity: true,
      shippingDistrict: true,
      subtotal: true,
      discountTotal: true,
      shippingTotal: true,
      codFee: true,
      taxTotal: true,
      total: true,
      couponCode: true,
      items: { select: { quantity: true } },
      refunds: { where: { status: 'SUCCEEDED' }, select: { amount: true } },
    },
  })
  const sar = halalasToSarString
  const rows = orders.map((order) => ({
    order_number: order.orderNumber,
    placed_at: toStoreDateTimeLocal(order.createdAt).replace('T', ' '),
    status: order.status,
    payment_status: order.paymentStatus,
    payment_method: order.paymentMethod,
    shipping_method: order.shippingMethod,
    customer_name: order.shippingName,
    customer_email: order.shippingEmail,
    // Local form (05X…): a leading "+" would trip spreadsheet formula protection.
    customer_phone: formatSaudiMobile(order.shippingPhone),
    city: order.shippingCity,
    district: order.shippingDistrict,
    items: order.items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: sar(order.subtotal),
    discount: sar(order.discountTotal),
    shipping: sar(order.shippingTotal),
    cod_fee: sar(order.codFee),
    vat: sar(order.taxTotal),
    total: sar(order.total),
    refunded: sar(order.refunds.reduce((sum, refund) => sum + refund.amount, 0)),
    coupon: order.couponCode ?? '',
  }))
  await recordAudit(prisma, audit, {
    action: 'orders.exported',
    entityType: 'order',
    metadata: {
      count: rows.length,
      status: filters.status ?? null,
      from: filters.from?.toISOString() ?? null,
      to: filters.to?.toISOString() ?? null,
    },
  })
  return rows
}
