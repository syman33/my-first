import type { Locale } from '@/i18n/config'

/**
 * Email layout. Table-based, inline styles (email clients ignore stylesheets),
 * RTL for Arabic. Every interpolated value is HTML-escaped by callers via `esc`.
 */

export function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export function button(url: string, label: string): string {
  return `<p style="margin:28px 0"><a href="${esc(url)}" style="display:inline-block;background:#171717;color:#ffffff;padding:14px 32px;text-decoration:none;font-size:14px;letter-spacing:0.5px">${esc(label)}</a></p>`
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 16px">${esc(text)}</p>`
}

const FOOTER: Record<Locale, string> = {
  ar: 'هذه رسالة تلقائية من فيلورا. إذا لم تطلب هذا الإجراء يمكنك تجاهل الرسالة.',
  en: 'This is an automated message from VÉLORA. If you did not request this, you can ignore it.',
}

export function layout(locale: Locale, subject: string, bodyHtml: string): string {
  const dir = locale === 'ar' ? 'rtl' : 'ltr'
  const align = locale === 'ar' ? 'right' : 'left'
  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f7f4ef;color:#202020;font-family:Tahoma,'Segoe UI',Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ef;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e7e2da">
<tr><td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid #e7e2da">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;letter-spacing:8px;color:#171717">VÉLORA</div>
<div style="font-size:12px;color:#7d6342;margin-top:6px">فيلورا</div>
</td></tr>
<tr><td dir="${dir}" style="padding:36px 40px;font-size:15px;line-height:1.8;text-align:${align}">${bodyHtml}</td></tr>
<tr><td dir="${dir}" style="padding:20px 40px;background:#faf8f4;border-top:1px solid #e7e2da;font-size:12px;line-height:1.7;color:#6b6b6b;text-align:center">${esc(FOOTER[locale])}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
