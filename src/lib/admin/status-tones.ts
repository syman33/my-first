import type {
  OrderStatus,
  PaymentStatus,
  ReturnStatus,
  ReviewStatus,
} from '@/generated/prisma/enums'

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent'

/** Badge tones for statuses across the back office (with their text label, never colour alone). */
export const ORDER_STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  PENDING: 'warning',
  CONFIRMED: 'info',
  PROCESSING: 'info',
  SHIPPED: 'accent',
  OUT_FOR_DELIVERY: 'accent',
  DELIVERED: 'success',
  CANCELLED: 'danger',
  REFUNDED: 'neutral',
}

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, BadgeTone> = {
  PENDING: 'warning',
  PAID: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  REFUNDED: 'neutral',
  PARTIALLY_REFUNDED: 'accent',
}

export const RETURN_STATUS_TONE: Record<ReturnStatus, BadgeTone> = {
  REQUESTED: 'warning',
  APPROVED: 'accent',
  REJECTED: 'danger',
  RECEIVED: 'info',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
}

export const REVIEW_STATUS_TONE: Record<ReviewStatus, BadgeTone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
}
