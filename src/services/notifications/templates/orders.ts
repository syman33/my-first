import type { Locale } from '@/i18n/config'
import { formatBasisPoints, formatDate, formatMoney } from '@/i18n/format'
import type { ReturnReason } from '@/lib/orders/returns'
import { button, esc, layout, paragraph, type RenderedEmail } from './layout'

/**
 * Order and return emails. Amounts are integer halalas formatted for the
 * recipient's locale; every interpolated value is escaped.
 */

export interface EmailOrderLine {
  name: string
  variantName: string | null
  quantity: number
  /** Line total after discount (halalas). */
  lineTotal: number
}

export interface EmailOrder {
  orderNumber: string
  customerName: string
  paymentMethod: string
  items: EmailOrderLine[]
  subtotal: number
  discountTotal: number
  shippingTotal: number
  codFee: number
  taxTotal: number
  taxRateBps: number
  pricesIncludeTax: boolean
  total: number
  address: string[]
  orderUrl: string
}

const METHOD: Record<Locale, Record<string, string>> = {
  ar: {
    MADA: 'مدى',
    CARD: 'بطاقة ائتمانية',
    APPLE_PAY: 'Apple Pay',
    STC_PAY: 'STC Pay',
    COD: 'الدفع عند الاستلام',
  },
  en: {
    MADA: 'mada',
    CARD: 'Credit card',
    APPLE_PAY: 'Apple Pay',
    STC_PAY: 'STC Pay',
    COD: 'Cash on delivery',
  },
}

export const RETURN_REASON_LABEL: Record<Locale, Record<ReturnReason, string>> = {
  ar: {
    CHANGED_MIND: 'غيّرت رأيي',
    DEFECTIVE: 'عيب في المنتج',
    DAMAGED_IN_TRANSIT: 'وصل المنتج تالفاً',
    WRONG_ITEM: 'وصلني منتج مختلف',
    NOT_AS_DESCRIBED: 'لا يطابق الوصف',
    OTHER: 'سبب آخر',
  },
  en: {
    CHANGED_MIND: 'Changed my mind',
    DEFECTIVE: 'Defective item',
    DAMAGED_IN_TRANSIT: 'Arrived damaged',
    WRONG_ITEM: 'Received the wrong item',
    NOT_AS_DESCRIBED: 'Not as described',
    OTHER: 'Other',
  },
}

const L = {
  ar: {
    greeting: (name: string) => `مرحباً ${name}،`,
    orderNumber: 'رقم الطلب',
    item: 'المنتج',
    qty: 'الكمية',
    amount: 'المبلغ',
    subtotal: 'المجموع الفرعي',
    discount: 'الخصم',
    shipping: 'الشحن',
    free: 'مجاني',
    codFee: 'رسوم الدفع عند الاستلام',
    vatIncluded: (rate: string) => `يشمل ضريبة القيمة المضافة (${rate})`,
    vat: (rate: string) => `ضريبة القيمة المضافة (${rate})`,
    total: 'الإجمالي',
    payment: 'طريقة الدفع',
    address: 'عنوان التوصيل',
    viewOrder: 'عرض الطلب',
  },
  en: {
    greeting: (name: string) => `Hello ${name},`,
    orderNumber: 'Order number',
    item: 'Item',
    qty: 'Qty',
    amount: 'Amount',
    subtotal: 'Subtotal',
    discount: 'Discount',
    shipping: 'Shipping',
    free: 'Free',
    codFee: 'Cash on delivery fee',
    vatIncluded: (rate: string) => `Includes VAT (${rate})`,
    vat: (rate: string) => `VAT (${rate})`,
    total: 'Total',
    payment: 'Payment method',
    address: 'Delivery address',
    viewOrder: 'View order',
  },
} as const

function summaryHtml(locale: Locale, order: EmailOrder): string {
  const l = L[locale]
  const align = locale === 'ar' ? 'left' : 'right'
  const money = (value: number) => formatMoney(value, locale)
  const rate = formatBasisPoints(order.taxRateBps, locale)
  const items = order.items
    .map(
      (item) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #eee">${esc(item.name)}${
          item.variantName
            ? `<div style="font-size:12px;color:#6b6b6b">${esc(item.variantName)}</div>`
            : ''
        }</td><td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center">${esc(item.quantity)}</td><td style="padding:10px 0;border-bottom:1px solid #eee;text-align:${align};white-space:nowrap">${esc(money(item.lineTotal))}</td></tr>`,
    )
    .join('')
  const totals: [string, string][] = [[l.subtotal, money(order.subtotal)]]
  if (order.discountTotal > 0) totals.push([l.discount, `-${money(order.discountTotal)}`])
  totals.push([l.shipping, order.shippingTotal === 0 ? l.free : money(order.shippingTotal)])
  if (order.codFee > 0) totals.push([l.codFee, money(order.codFee)])
  if (order.taxTotal > 0 && !order.pricesIncludeTax)
    totals.push([l.vat(rate), money(order.taxTotal)])
  const totalsRows = totals
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 0;color:#6b6b6b">${esc(label)}</td><td style="padding:4px 0;text-align:${align};white-space:nowrap">${esc(value)}</td></tr>`,
    )
    .join('')
  const vatNote =
    order.taxTotal > 0 && order.pricesIncludeTax
      ? `<tr><td colspan="2" style="padding:2px 0;font-size:12px;color:#6b6b6b">${esc(l.vatIncluded(rate))}: ${esc(money(order.taxTotal))}</td></tr>`
      : ''
  return `<p style="margin:0 0 8px;font-size:13px;color:#6b6b6b">${esc(l.orderNumber)}: <strong style="color:#171717">${esc(order.orderNumber)}</strong></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:8px 0 16px">
<tr><th style="text-align:start;padding:6px 0;border-bottom:1px solid #171717;font-weight:normal;color:#6b6b6b">${esc(l.item)}</th><th style="padding:6px 8px;border-bottom:1px solid #171717;font-weight:normal;color:#6b6b6b">${esc(l.qty)}</th><th style="text-align:${align};padding:6px 0;border-bottom:1px solid #171717;font-weight:normal;color:#6b6b6b">${esc(l.amount)}</th></tr>
${items}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0 0 20px">${totalsRows}
<tr><td style="padding:8px 0 0;font-weight:bold;border-top:1px solid #e7e2da">${esc(l.total)}</td><td style="padding:8px 0 0;font-weight:bold;border-top:1px solid #e7e2da;text-align:${align};white-space:nowrap">${esc(money(order.total))}</td></tr>${vatNote}</table>
<p style="margin:0 0 4px;font-size:13px;color:#6b6b6b">${esc(l.payment)}: ${esc(METHOD[locale][order.paymentMethod] ?? order.paymentMethod)}</p>
<p style="margin:0 0 16px;font-size:13px;color:#6b6b6b">${esc(l.address)}: ${order.address.map(esc).join('، ')}</p>`
}

function summaryText(locale: Locale, order: EmailOrder): string {
  const l = L[locale]
  const money = (value: number) => formatMoney(value, locale)
  const lines = order.items.map(
    (item) =>
      `- ${item.name}${item.variantName ? ` (${item.variantName})` : ''} × ${item.quantity}: ${money(item.lineTotal)}`,
  )
  return [
    `${l.orderNumber}: ${order.orderNumber}`,
    ...lines,
    `${l.total}: ${money(order.total)}`,
    `${l.payment}: ${METHOD[locale][order.paymentMethod] ?? order.paymentMethod}`,
  ].join('\n')
}

function orderEmail(
  locale: Locale,
  order: EmailOrder,
  subject: string,
  intro: string[],
  options: { summary?: boolean; extraHtml?: string; extraText?: string } = {},
): RenderedEmail {
  const l = L[locale]
  const summary = options.summary ?? true
  const html = layout(
    locale,
    subject,
    paragraph(l.greeting(order.customerName)) +
      intro.map(paragraph).join('') +
      (options.extraHtml ?? '') +
      (summary ? summaryHtml(locale, order) : '') +
      button(order.orderUrl, l.viewOrder),
  )
  const text = [
    l.greeting(order.customerName),
    ...intro,
    options.extraText ?? '',
    summary ? summaryText(locale, order) : '',
    `${l.viewOrder}: ${order.orderUrl}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  return { subject, html, text }
}

const copy = {
  received: {
    ar: {
      subject: (n: string) => `استلمنا طلبك ${n}`,
      body: 'شكراً لتسوقك من فيلورا. سيتواصل معك فريقنا لتأكيد الطلب، ويكون الدفع نقداً عند الاستلام.',
    },
    en: {
      subject: (n: string) => `We received your order ${n}`,
      body: 'Thank you for shopping with VÉLORA. Our team will contact you to confirm the order; you pay in cash on delivery.',
    },
  },
  paid: {
    ar: {
      subject: (n: string) => `تم تأكيد طلبك ${n}`,
      body: 'استلمنا دفعتك بنجاح وتم تأكيد طلبك. سنرسل لك رسالة عند شحنه.',
    },
    en: {
      subject: (n: string) => `Your order ${n} is confirmed`,
      body: 'We have received your payment and your order is confirmed. We will let you know as soon as it ships.',
    },
  },
  codConfirmed: {
    ar: {
      subject: (n: string) => `تم تأكيد طلبك ${n}`,
      body: 'تم تأكيد طلبك وهو الآن قيد التجهيز. الدفع نقداً عند الاستلام.',
    },
    en: {
      subject: (n: string) => `Your order ${n} is confirmed`,
      body: 'Your order is confirmed and is being prepared. You pay in cash on delivery.',
    },
  },
  paymentFailed: {
    ar: {
      subject: (n: string) => `لم تكتمل عملية الدفع للطلب ${n}`,
      body: 'لم تكتمل عملية الدفع، لذا أُلغي الطلب ولم يُخصم أي مبلغ. أعدنا المنتجات إلى حقيبتك لتتمكن من المحاولة مرة أخرى.',
      cta: 'العودة إلى الحقيبة',
    },
    en: {
      subject: (n: string) => `Payment for order ${n} was not completed`,
      body: 'The payment was not completed, so the order was cancelled and nothing was charged. We put the items back in your bag so you can try again.',
      cta: 'Back to your bag',
    },
  },
  shipped: {
    ar: {
      subject: (n: string) => `طلبك ${n} في الطريق إليك`,
      body: 'تم شحن طلبك.',
      carrier: 'شركة الشحن',
      tracking: 'رقم التتبع',
      track: 'تتبع الشحنة',
    },
    en: {
      subject: (n: string) => `Your order ${n} is on its way`,
      body: 'Your order has shipped.',
      carrier: 'Carrier',
      tracking: 'Tracking number',
      track: 'Track your parcel',
    },
  },
  delivered: {
    ar: {
      subject: (n: string) => `تم توصيل طلبك ${n}`,
      body: 'نتمنى أن تنال قطعك الجديدة إعجابك.',
      returns: (date: string) => `يمكنك طلب الإرجاع من صفحة الطلب حتى ${date}.`,
      review: 'شاركنا رأيك بتقييم المنتجات من صفحة الطلب.',
    },
    en: {
      subject: (n: string) => `Your order ${n} has been delivered`,
      body: 'We hope you love your new pieces.',
      returns: (date: string) => `You can request a return from the order page until ${date}.`,
      review: 'Tell us what you think by reviewing your items from the order page.',
    },
  },
  cancelled: {
    ar: {
      subject: (n: string) => `تم إلغاء الطلب ${n}`,
      body: 'تم إلغاء طلبك.',
      refund:
        'سيُعاد المبلغ المدفوع إلى وسيلة الدفع الأصلية، وقد يستغرق ظهوره بضعة أيام عمل حسب البنك.',
    },
    en: {
      subject: (n: string) => `Order ${n} was cancelled`,
      body: 'Your order has been cancelled.',
      refund:
        'The amount paid will be refunded to your original payment method; your bank may take a few business days to show it.',
    },
  },
  refunded: {
    ar: {
      subject: (n: string) => `تم استرداد مبلغ من الطلب ${n}`,
      body: (amount: string) =>
        `أصدرنا استرداداً بقيمة ${amount} إلى وسيلة الدفع الأصلية. قد يستغرق ظهوره بضعة أيام عمل حسب البنك.`,
    },
    en: {
      subject: (n: string) => `Refund issued for order ${n}`,
      body: (amount: string) =>
        `We have refunded ${amount} to your original payment method. Your bank may take a few business days to show it.`,
    },
  },
} as const

export function orderReceivedEmail(locale: Locale, order: EmailOrder): RenderedEmail {
  const c = copy.received[locale]
  return orderEmail(locale, order, c.subject(order.orderNumber), [c.body])
}

export function orderPaidEmail(locale: Locale, order: EmailOrder): RenderedEmail {
  const c = copy.paid[locale]
  return orderEmail(locale, order, c.subject(order.orderNumber), [c.body])
}

export function orderConfirmedCodEmail(locale: Locale, order: EmailOrder): RenderedEmail {
  const c = copy.codConfirmed[locale]
  return orderEmail(locale, order, c.subject(order.orderNumber), [c.body])
}

export function paymentFailedEmail(
  locale: Locale,
  order: EmailOrder,
  cartUrl: string,
): RenderedEmail {
  const c = copy.paymentFailed[locale]
  return orderEmail(locale, order, c.subject(order.orderNumber), [c.body], {
    summary: false,
    extraHtml: button(cartUrl, c.cta),
    extraText: `${c.cta}: ${cartUrl}`,
  })
}

export function orderShippedEmail(
  locale: Locale,
  order: EmailOrder,
  shipment: { carrier: string; trackingNumber: string | null; trackingUrl: string | null },
): RenderedEmail {
  const c = copy.shipped[locale]
  const rows = [
    `${c.carrier}: ${shipment.carrier}`,
    ...(shipment.trackingNumber ? [`${c.tracking}: ${shipment.trackingNumber}`] : []),
  ]
  return orderEmail(locale, order, c.subject(order.orderNumber), [c.body], {
    summary: false,
    extraHtml:
      rows.map(paragraph).join('') +
      (shipment.trackingUrl ? button(shipment.trackingUrl, c.track) : ''),
    extraText: [
      ...rows,
      ...(shipment.trackingUrl ? [`${c.track}: ${shipment.trackingUrl}`] : []),
    ].join('\n'),
  })
}

export function orderDeliveredEmail(
  locale: Locale,
  order: EmailOrder,
  returnDeadline: Date | null,
): RenderedEmail {
  const c = copy.delivered[locale]
  const intro: string[] = [c.body]
  if (returnDeadline) intro.push(c.returns(formatDate(returnDeadline, locale, 'long')))
  intro.push(c.review)
  return orderEmail(locale, order, c.subject(order.orderNumber), intro, { summary: false })
}

export function orderCancelledEmail(
  locale: Locale,
  order: EmailOrder,
  refundExpected: boolean,
): RenderedEmail {
  const c = copy.cancelled[locale]
  return orderEmail(
    locale,
    order,
    c.subject(order.orderNumber),
    refundExpected ? [c.body, c.refund] : [c.body],
    { summary: false },
  )
}

export function orderRefundedEmail(
  locale: Locale,
  order: EmailOrder,
  amount: number,
): RenderedEmail {
  const c = copy.refunded[locale]
  return orderEmail(
    locale,
    order,
    c.subject(order.orderNumber),
    [c.body(formatMoney(amount, locale))],
    { summary: false },
  )
}

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------

export interface EmailReturn {
  returnNumber: string
  orderNumber: string
  customerName: string
  reason: ReturnReason
  items: { name: string; variantName: string | null; quantity: number }[]
  orderUrl: string
}

const returnCopy = {
  ar: {
    greeting: (name: string) => `مرحباً ${name}،`,
    number: 'رقم طلب الإرجاع',
    reason: 'السبب',
    viewOrder: 'عرض الطلب',
    requested: {
      subject: (n: string) => `استلمنا طلب الإرجاع ${n}`,
      body: 'استلمنا طلب الإرجاع وسيراجعه فريقنا خلال يومي عمل، ثم نرسل لك الخطوات التالية.',
    },
    approved: {
      subject: (n: string) => `تمت الموافقة على طلب الإرجاع ${n}`,
      body: 'تمت الموافقة على طلب الإرجاع. يرجى تغليف المنتجات بحالتها الأصلية مع جميع الملحقات، وكتابة رقم طلب الإرجاع على الطرد. سنرسل لك تفاصيل الاستلام.',
    },
    rejected: {
      subject: (n: string) => `بخصوص طلب الإرجاع ${n}`,
      body: 'نعتذر، لم نتمكن من قبول طلب الإرجاع.',
      note: 'ملاحظة الفريق',
    },
    completed: {
      subject: (n: string) => `اكتمل طلب الإرجاع ${n}`,
      body: 'استلمنا المنتجات المرتجعة وأغلقنا طلب الإرجاع.',
      refund: (amount: string) =>
        `أصدرنا استرداداً بقيمة ${amount}. قد يستغرق ظهوره بضعة أيام عمل حسب البنك.`,
      bank: (amount: string) => `حوّلنا ${amount} إلى حسابك البنكي.`,
      noRefund: 'لا يترتب على هذا الإرجاع أي مبلغ مسترد. للاستفسار تواصل معنا.',
    },
  },
  en: {
    greeting: (name: string) => `Hello ${name},`,
    number: 'Return number',
    reason: 'Reason',
    viewOrder: 'View order',
    requested: {
      subject: (n: string) => `We received your return request ${n}`,
      body: 'We have received your return request. Our team will review it within two business days and send you the next steps.',
    },
    approved: {
      subject: (n: string) => `Your return ${n} is approved`,
      body: 'Your return is approved. Please pack the items in their original condition with all accessories and write the return number on the parcel. We will send you the pickup details.',
    },
    rejected: {
      subject: (n: string) => `About your return request ${n}`,
      body: 'We are sorry, we could not accept this return request.',
      note: 'Note from our team',
    },
    completed: {
      subject: (n: string) => `Your return ${n} is complete`,
      body: 'We have received the returned items and closed your return.',
      refund: (amount: string) =>
        `We have refunded ${amount}. Your bank may take a few business days to show it.`,
      bank: (amount: string) => `We have transferred ${amount} to your bank account.`,
      noRefund: 'This return carries no refund. Contact us if you have any questions.',
    },
  },
} as const

function returnEmail(
  locale: Locale,
  data: EmailReturn,
  subject: string,
  body: string[],
): RenderedEmail {
  const c = returnCopy[locale]
  const items = data.items.map(
    (item) => `${item.name}${item.variantName ? ` (${item.variantName})` : ''} × ${item.quantity}`,
  )
  const facts = [
    `${c.number}: ${data.returnNumber}`,
    `${c.reason}: ${RETURN_REASON_LABEL[locale][data.reason]}`,
  ]
  const html = layout(
    locale,
    subject,
    paragraph(c.greeting(data.customerName)) +
      body.map(paragraph).join('') +
      facts.map(paragraph).join('') +
      `<ul style="margin:0 0 16px;padding-inline-start:20px">${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` +
      button(data.orderUrl, c.viewOrder),
  )
  const text = [
    c.greeting(data.customerName),
    ...body,
    ...facts,
    items.map((item) => `- ${item}`).join('\n'),
    `${c.viewOrder}: ${data.orderUrl}`,
  ].join('\n\n')
  return { subject, html, text }
}

export function returnRequestedEmail(locale: Locale, data: EmailReturn): RenderedEmail {
  const c = returnCopy[locale].requested
  return returnEmail(locale, data, c.subject(data.returnNumber), [c.body])
}

export function returnApprovedEmail(locale: Locale, data: EmailReturn): RenderedEmail {
  const c = returnCopy[locale].approved
  return returnEmail(locale, data, c.subject(data.returnNumber), [c.body])
}

export function returnRejectedEmail(
  locale: Locale,
  data: EmailReturn,
  note: string | null,
): RenderedEmail {
  const c = returnCopy[locale].rejected
  return returnEmail(
    locale,
    data,
    c.subject(data.returnNumber),
    note ? [c.body, `${c.note}: ${note}`] : [c.body],
  )
}

export function returnCompletedEmail(
  locale: Locale,
  data: EmailReturn,
  refund: { amount: number; manual: boolean } | null,
): RenderedEmail {
  const c = returnCopy[locale].completed
  const money = refund ? formatMoney(refund.amount, locale) : ''
  const outcome = !refund ? c.noRefund : refund.manual ? c.bank(money) : c.refund(money)
  return returnEmail(locale, data, c.subject(data.returnNumber), [c.body, outcome])
}

/**
 * Internal notice to the store that an order needs handling: cash-on-delivery
 * orders when placed, online orders once paid (Arabic with English labels).
 */
export function orderStaffEmail(
  data: EmailOrder & { customerEmail: string; recipientPhone: string; adminUrl: string },
): RenderedEmail {
  const money = formatMoney(data.total, 'ar')
  const subject = `طلب جديد | New order ${data.orderNumber} — ${money}`
  const rows: [string, string][] = [
    ['الطلب / Order', data.orderNumber],
    ['العميل / Customer', `${data.customerName} <${data.customerEmail}>`],
    ['جوال المستلم / Recipient phone', data.recipientPhone],
    [
      'الدفع / Payment',
      `${METHOD.ar[data.paymentMethod] ?? data.paymentMethod} / ${METHOD.en[data.paymentMethod] ?? data.paymentMethod}`,
    ],
  ]
  const table = `<table role="presentation" cellpadding="6" cellspacing="0" style="width:100%;font-size:14px;margin:0 0 16px">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="color:#6b6b6b;white-space:nowrap">${esc(label)}</td><td>${esc(value)}</td></tr>`,
    )
    .join('')}</table>`
  return {
    subject,
    html: layout(
      'ar',
      subject,
      table +
        summaryHtml('ar', data) +
        button(data.adminUrl, 'فتح في لوحة الإدارة / Open in admin'),
    ),
    text: `${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\n${summaryText('ar', data)}\n\n${data.address.join('، ')}\n\n${data.adminUrl}`,
  }
}

/** Internal notice to customer care (Arabic with English labels). */
export function returnStaffEmail(
  data: EmailReturn & { customerEmail: string; note: string | null; adminUrl: string },
): RenderedEmail {
  const subject = `طلب إرجاع جديد | New return request ${data.returnNumber}`
  const rows: [string, string][] = [
    ['رقم الإرجاع / Return', data.returnNumber],
    ['الطلب / Order', data.orderNumber],
    ['العميل / Customer', `${data.customerName} <${data.customerEmail}>`],
    [
      'السبب / Reason',
      `${RETURN_REASON_LABEL.ar[data.reason]} / ${RETURN_REASON_LABEL.en[data.reason]}`,
    ],
  ]
  const items = data.items.map(
    (item) => `${item.name}${item.variantName ? ` (${item.variantName})` : ''} × ${item.quantity}`,
  )
  const table = `<table role="presentation" cellpadding="6" cellspacing="0" style="width:100%;font-size:14px;margin:0 0 16px">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="color:#6b6b6b;white-space:nowrap">${esc(label)}</td><td>${esc(value)}</td></tr>`,
    )
    .join('')}</table>`
  const note = data.note
    ? `<div style="white-space:pre-wrap;border:1px solid #e7e2da;padding:16px;font-size:14px;line-height:1.8;margin:0 0 16px">${esc(data.note)}</div>`
    : ''
  return {
    subject,
    html: layout(
      'ar',
      subject,
      table +
        `<ul style="margin:0 0 16px;padding-inline-start:20px">${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` +
        note +
        button(data.adminUrl, 'فتح في لوحة الإدارة / Open in admin'),
    ),
    text: `${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\n${items.join('\n')}\n\n${data.note ?? ''}\n\n${data.adminUrl}`,
  }
}
