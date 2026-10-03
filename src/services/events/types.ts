/**
 * Domain events written to the transactional outbox. Payloads must be
 * JSON-serialisable and must never contain plaintext secrets: anything
 * sensitive (e.g. a password-reset URL) is sealed with AES-GCM and purged
 * after processing.
 */

export interface OutboxPayloads {
  USER_REGISTERED: { userId: string; locale: 'ar' | 'en' }
  EMAIL_VERIFICATION_REQUESTED: { userId: string; locale: 'ar' | 'en'; sealedVerifyUrl: string }
  PASSWORD_RESET_REQUESTED: { userId: string; locale: 'ar' | 'en'; sealedResetUrl: string }
  PASSWORD_CHANGED: { userId: string; locale: 'ar' | 'en' }
  ORDER_PLACED: { orderId: string }
  PAYMENT_SUCCEEDED: { orderId: string; paymentId: string }
  PAYMENT_FAILED: { orderId: string; paymentId: string }
  ORDER_CONFIRMED: { orderId: string }
  ORDER_SHIPPED: { orderId: string; shipmentId: string }
  ORDER_DELIVERED: { orderId: string }
  ORDER_CANCELLED: { orderId: string; reason: string | null }
  ORDER_REFUNDED: { orderId: string; refundId: string }
  RETURN_REQUESTED: { returnRequestId: string }
  CONTACT_MESSAGE_RECEIVED: { contactMessageId: string }
  NEWSLETTER_SUBSCRIBED: { subscriberId: string; sealedUnsubscribeUrl: string }
}

export type OutboxEventType = keyof OutboxPayloads

export interface OutboxEventInput<T extends OutboxEventType = OutboxEventType> {
  type: T
  payload: OutboxPayloads[T]
  aggregateType?: 'user' | 'order' | 'payment' | 'return' | 'contact' | 'newsletter'
  aggregateId?: string
}

/** Payload keys holding sealed secrets; cleared once the event has been processed. */
export const SEALED_PAYLOAD_KEYS = [
  'sealedVerifyUrl',
  'sealedResetUrl',
  'sealedUnsubscribeUrl',
] as const
