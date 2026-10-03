import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ShipmentStatus,
  ShippingMethod,
} from '@/generated/prisma/enums'

export interface CustomerOrderSummary {
  id: string
  orderNumber: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  paymentMethod: PaymentMethod
  total: number
  createdAt: Date
  itemCount: number
  images: string[]
}

export interface OrderAddressView {
  fullName: string
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

export interface OrderItemView {
  id: string
  name: string
  variantName: string | null
  slug: string | null
  sku: string
  imageUrl: string | null
  unitPrice: number
  quantity: number
  lineSubtotal: number
  discountAmount: number
  taxAmount: number
  lineTotal: number
}

export interface CustomerOrderDetail {
  id: string
  orderNumber: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  paymentMethod: PaymentMethod
  shippingMethod: ShippingMethod
  createdAt: Date
  subtotal: number
  discountTotal: number
  couponCode: string | null
  shippingTotal: number
  codFee: number
  taxTotal: number
  taxRateBps: number
  pricesIncludeTax: boolean
  total: number
  customerNote: string | null
  cancellationReason: string | null
  shippingAddress: OrderAddressView
  items: OrderItemView[]
  history: { status: OrderStatus; at: Date; note: string | null }[]
  shipments: {
    carrier: string
    trackingNumber: string | null
    trackingUrl: string | null
    status: ShipmentStatus
    shippedAt: Date | null
    deliveredAt: Date | null
  }[]
  paidAt: Date | null
  canCancel: boolean
  canPay: boolean
  paymentDeadline: Date | null
}
