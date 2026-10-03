import type { OrderStatus } from '@/generated/prisma/enums'
import { cn } from '@/utils/cn'

const tone: Record<OrderStatus, string> = {
  PENDING: 'bg-warning-soft text-warning',
  CONFIRMED: 'bg-sand text-ink',
  PROCESSING: 'bg-sand text-ink',
  SHIPPED: 'bg-champagne-soft text-champagne-strong',
  OUT_FOR_DELIVERY: 'bg-champagne-soft text-champagne-strong',
  DELIVERED: 'bg-success-soft text-success',
  CANCELLED: 'bg-danger-soft text-danger',
  REFUNDED: 'bg-line text-text',
}

export function OrderStatusBadge({
  status,
  label,
  className,
}: {
  status: OrderStatus
  label: string
  className?: string
}) {
  return (
    <span className={cn('inline-block px-2 py-0.5 text-xs font-medium', tone[status], className)}>
      {label}
    </span>
  )
}
