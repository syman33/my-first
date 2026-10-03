import type {
  ActorType,
  ItemCondition,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  RefundStatus,
  ReturnStatus,
  ShipmentStatus,
  ShippingMethod,
} from '@/generated/prisma/enums'

/** Back-office order shapes (passed from server pages to client action panels). */

export interface AdminOrderRow {
  id: string
  orderNumber: string
  createdAt: Date
  status: OrderStatus
  paymentStatus: PaymentStatus
  paymentMethod: PaymentMethod
  total: number
  itemCount: number
  customerName: string
  customerEmail: string
  attentionReason: string | null
}

export interface AdminPaymentView {
  id: string
  provider: string
  method: PaymentMethod
  status: PaymentStatus
  amount: number
  refundedAmount: number
  /** Still refundable: captured − refunded − refunds in flight. */
  refundable: number
  providerPaymentId: string | null
  failureMessage: string | null
  paidAt: Date | null
  createdAt: Date
}

export interface AdminOrderActions {
  confirm: boolean
  process: boolean
  ship: boolean
  outForDelivery: boolean
  deliver: boolean
  cancel: boolean
  refund: boolean
  resolveAttention: boolean
}

export interface AdminOrderDetail {
  id: string
  orderNumber: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  paymentMethod: PaymentMethod
  shippingMethod: ShippingMethod
  createdAt: Date
  confirmedAt: Date | null
  shippedAt: Date | null
  deliveredAt: Date | null
  cancelledAt: Date | null
  cancellationReason: string | null
  attentionReason: string | null
  locale: string
  customer: { id: string; name: string; email: string; phone: string | null }
  shipping: {
    name: string
    phone: string
    email: string
    city: string
    district: string
    street: string
    buildingNumber: string
    postalCode: string
    additionalNumber: string | null
    instructions: string | null
  }
  customerNote: string | null
  couponCode: string | null
  subtotal: number
  discountTotal: number
  shippingTotal: number
  codFee: number
  taxTotal: number
  taxRateBps: number
  pricesIncludeTax: boolean
  total: number
  items: {
    id: string
    productId: string | null
    nameAr: string
    nameEn: string
    variantNameAr: string | null
    variantNameEn: string | null
    sku: string
    imageUrl: string | null
    unitPrice: number
    quantity: number
    returnedQuantity: number
    discountAmount: number
    taxAmount: number
    lineTotal: number
  }[]
  payments: AdminPaymentView[]
  refunds: {
    id: string
    amount: number
    status: RefundStatus
    reason: string
    reference: string | null
    failureMessage: string | null
    createdAt: Date
    createdBy: string | null
  }[]
  shipments: {
    id: string
    provider: string
    carrier: string
    trackingNumber: string | null
    trackingUrl: string | null
    status: ShipmentStatus
    shippedAt: Date | null
    deliveredAt: Date | null
    events: { status: ShipmentStatus; description: string | null; occurredAt: Date }[]
  }[]
  returns: { id: string; returnNumber: string; status: ReturnStatus; createdAt: Date }[]
  history: {
    toStatus: OrderStatus
    fromStatus: OrderStatus | null
    actorType: ActorType
    actorName: string | null
    note: string | null
    createdAt: Date
  }[]
  actions: AdminOrderActions
}

export interface AdminReturnRow {
  id: string
  returnNumber: string
  status: ReturnStatus
  reason: string
  createdAt: Date
  orderId: string
  orderNumber: string
  customerName: string
  customerEmail: string
  units: number
}

export interface AdminReturnDetail {
  id: string
  returnNumber: string
  status: ReturnStatus
  reason: string
  customerNote: string | null
  adminNote: string | null
  createdAt: Date
  reviewedAt: Date | null
  reviewedBy: string | null
  receivedAt: Date | null
  completedAt: Date | null
  order: {
    id: string
    orderNumber: string
    paymentMethod: PaymentMethod
    deliveredAt: Date | null
  }
  customer: { id: string; name: string; email: string; phone: string | null }
  items: {
    id: string
    orderItemId: string
    nameAr: string
    nameEn: string
    variantNameAr: string | null
    variantNameEn: string | null
    sku: string
    imageUrl: string | null
    quantity: number
    purchasedQuantity: number
    condition: ItemCondition | null
    restockedQuantity: number
  }[]
  refunds: {
    id: string
    amount: number
    status: RefundStatus
    reference: string | null
    createdAt: Date
  }[]
}
