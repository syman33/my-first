import type { PluralForms } from '../index'

// Arabic has six plural categories; English needs only one/other.
const itemCount: PluralForms = {
  zero: 'لا توجد منتجات',
  one: 'منتج واحد',
  two: 'منتجان',
  few: '{count} منتجات',
  many: '{count} منتجاً',
  other: '{count} منتج',
}

const ar = {
  status: {
    PENDING: 'قيد الانتظار',
    CONFIRMED: 'مؤكَّد',
    PROCESSING: 'قيد التجهيز',
    SHIPPED: 'تم الشحن',
    OUT_FOR_DELIVERY: 'خرج للتوصيل',
    DELIVERED: 'تم التوصيل',
    CANCELLED: 'ملغى',
    REFUNDED: 'مسترد',
  },
  paymentStatus: {
    PENDING: 'بانتظار الدفع',
    PAID: 'مدفوع',
    FAILED: 'فشل الدفع',
    CANCELLED: 'ملغى',
    REFUNDED: 'مسترد',
    PARTIALLY_REFUNDED: 'مسترد جزئياً',
  },
  shippingMethod: {
    STANDARD: 'توصيل عادي',
    EXPRESS: 'توصيل سريع',
  },
  orderNumber: 'رقم الطلب',
  placedOn: 'تاريخ الطلب',
  total: 'الإجمالي',
  view: 'عرض الطلب',
  itemCount,
}

const en: typeof ar = {
  status: {
    PENDING: 'Pending',
    CONFIRMED: 'Confirmed',
    PROCESSING: 'Processing',
    SHIPPED: 'Shipped',
    OUT_FOR_DELIVERY: 'Out for delivery',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
    REFUNDED: 'Refunded',
  },
  paymentStatus: {
    PENDING: 'Awaiting payment',
    PAID: 'Paid',
    FAILED: 'Payment failed',
    CANCELLED: 'Cancelled',
    REFUNDED: 'Refunded',
    PARTIALLY_REFUNDED: 'Partially refunded',
  },
  shippingMethod: {
    STANDARD: 'Standard delivery',
    EXPRESS: 'Express delivery',
  },
  orderNumber: 'Order number',
  placedOn: 'Order date',
  total: 'Total',
  view: 'View order',
  itemCount: { one: '{count} item', other: '{count} items' },
}

export const orders = { ar, en }
