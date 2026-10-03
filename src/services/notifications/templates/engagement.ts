import type { Locale } from '@/i18n/config'
import { button, esc, layout, paragraph, type RenderedEmail } from './layout'

const copy = {
  newsletter: {
    ar: {
      subject: 'أهلاً بك في نشرة فيلورا',
      body: 'شكراً لاشتراكك في نشرتنا البريدية. ستصلك أحدث مجموعاتنا وعروضنا الخاصة أولاً بأول.',
      cta: 'تصفّح المجموعة',
      unsubscribe: 'لا ترغب في استلام النشرة؟ يمكنك إلغاء الاشتراك من هنا:',
    },
    en: {
      subject: 'Welcome to the VÉLORA newsletter',
      body: 'Thank you for subscribing. You will be the first to hear about new collections and private offers.',
      cta: 'Explore the collection',
      unsubscribe: 'Rather not receive the newsletter? Unsubscribe here:',
    },
  },
} as const

export function newsletterWelcomeEmail(
  locale: Locale,
  data: { shopUrl: string; unsubscribeUrl: string },
): RenderedEmail {
  const c = copy.newsletter[locale]
  const html = layout(
    locale,
    c.subject,
    paragraph(c.body) +
      button(data.shopUrl, c.cta) +
      `<p style="margin:24px 0 0;font-size:12px;color:#6b6b6b">${esc(c.unsubscribe)} <a href="${esc(data.unsubscribeUrl)}" style="color:#7d6342">${esc(data.unsubscribeUrl)}</a></p>`,
  )
  return {
    subject: c.subject,
    html,
    text: `${c.body}\n\n${c.cta}: ${data.shopUrl}\n\n${c.unsubscribe} ${data.unsubscribeUrl}`,
  }
}

/** Internal notification to customer care (always Arabic + English labels). */
export function contactStaffEmail(data: {
  name: string
  email: string
  phone: string | null
  subject: string
  message: string
  adminUrl: string
}): RenderedEmail {
  const subject = `رسالة تواصل جديدة | New contact message: ${data.subject}`
  const rows: [string, string][] = [
    ['الاسم / Name', data.name],
    ['البريد / Email', data.email],
    ['الجوال / Mobile', data.phone ?? '—'],
    ['الموضوع / Subject', data.subject],
  ]
  const table = `<table role="presentation" cellpadding="6" cellspacing="0" style="width:100%;font-size:14px;margin:0 0 16px">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="color:#6b6b6b;white-space:nowrap">${esc(label)}</td><td>${esc(value)}</td></tr>`,
    )
    .join('')}</table>`
  const message = `<div style="white-space:pre-wrap;border:1px solid #e7e2da;padding:16px;font-size:14px;line-height:1.8">${esc(data.message)}</div>`
  return {
    subject,
    html: layout(
      'ar',
      subject,
      table + message + button(data.adminUrl, 'فتح في لوحة الإدارة / Open in admin'),
    ),
    text: `${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\n${data.message}\n\n${data.adminUrl}`,
  }
}
