import type { Locale } from '@/i18n/config'
import { button, layout, paragraph, type RenderedEmail } from './layout'

const t = {
  welcome: {
    ar: {
      subject: 'مرحباً بك في فيلورا',
      greeting: (n: string) => `أهلاً ${n}،`,
      body: 'سعداء بانضمامك إلى فيلورا. أصبح بإمكانك الآن حفظ عناوينك ومتابعة طلباتك وإضافة قطعك المفضلة إلى قائمتك.',
      cta: 'ابدأ التسوق',
    },
    en: {
      subject: 'Welcome to VÉLORA',
      greeting: (n: string) => `Hello ${n},`,
      body: 'We are delighted to welcome you. You can now save your addresses, follow your orders and keep a wishlist of your favourite pieces.',
      cta: 'Start shopping',
    },
  },
  verify: {
    ar: {
      subject: 'أكّد بريدك الإلكتروني',
      body: 'يرجى تأكيد بريدك الإلكتروني بالضغط على الزر أدناه. صلاحية الرابط 24 ساعة.',
      cta: 'تأكيد البريد الإلكتروني',
    },
    en: {
      subject: 'Confirm your email address',
      body: 'Please confirm your email address using the button below. The link is valid for 24 hours.',
      cta: 'Confirm email',
    },
  },
  reset: {
    ar: {
      subject: 'إعادة تعيين كلمة المرور',
      body: 'تلقّينا طلباً لإعادة تعيين كلمة المرور لحسابك. الرابط صالح لمدة ساعة واحدة ويمكن استخدامه مرة واحدة فقط.',
      cta: 'إعادة تعيين كلمة المرور',
      ignore: 'إذا لم تطلب ذلك فلا داعي لأي إجراء، وستبقى كلمة المرور الحالية كما هي.',
    },
    en: {
      subject: 'Reset your password',
      body: 'We received a request to reset the password for your account. The link is valid for one hour and can only be used once.',
      cta: 'Reset password',
      ignore:
        'If you did not request this, no action is needed and your current password stays unchanged.',
    },
  },
  invite: {
    ar: {
      subject: 'دعوة للانضمام إلى فريق فيلورا',
      body: (inviter: string) =>
        `دعاك ${inviter} للانضمام إلى فريق العمل في لوحة إدارة فيلورا. اختر كلمة مرور لحسابك من الرابط أدناه، وصلاحيته 72 ساعة ويُستخدم مرة واحدة.`,
      cta: 'اختيار كلمة المرور',
      ignore: 'إذا لم تكن تتوقع هذه الدعوة فتجاهل هذه الرسالة، ولن يُفعَّل الحساب.',
    },
    en: {
      subject: 'You are invited to the VÉLORA team',
      body: (inviter: string) =>
        `${inviter} has invited you to the VÉLORA back office. Choose a password for your account using the link below; it is valid for 72 hours and can be used once.`,
      cta: 'Choose a password',
      ignore:
        'If you were not expecting this invitation, ignore this email and the account stays unused.',
    },
  },
  changed: {
    ar: {
      subject: 'تم تغيير كلمة المرور',
      body: 'تم تغيير كلمة المرور لحسابك في فيلورا، وسُجّل خروجك من جميع الأجهزة الأخرى.',
      warn: 'إذا لم تقم بهذا التغيير، يرجى إعادة تعيين كلمة المرور فوراً والتواصل معنا.',
    },
    en: {
      subject: 'Your password was changed',
      body: 'The password for your VÉLORA account was changed and all other devices were signed out.',
      warn: 'If you did not make this change, reset your password immediately and contact us.',
    },
  },
} as const

export function welcomeEmail(
  locale: Locale,
  data: { name: string; shopUrl: string },
): RenderedEmail {
  const c = t.welcome[locale]
  const html = layout(
    locale,
    c.subject,
    paragraph(c.greeting(data.name)) + paragraph(c.body) + button(data.shopUrl, c.cta),
  )
  return {
    subject: c.subject,
    html,
    text: `${c.greeting(data.name)}\n\n${c.body}\n\n${c.cta}: ${data.shopUrl}`,
  }
}

export function verifyEmailEmail(
  locale: Locale,
  data: { name: string; verifyUrl: string },
): RenderedEmail {
  const c = t.verify[locale]
  const greeting = t.welcome[locale].greeting(data.name)
  const html = layout(
    locale,
    c.subject,
    paragraph(greeting) + paragraph(c.body) + button(data.verifyUrl, c.cta),
  )
  return { subject: c.subject, html, text: `${greeting}\n\n${c.body}\n\n${data.verifyUrl}` }
}

export function passwordResetEmail(
  locale: Locale,
  data: { name: string; resetUrl: string },
): RenderedEmail {
  const c = t.reset[locale]
  const greeting = t.welcome[locale].greeting(data.name)
  const html = layout(
    locale,
    c.subject,
    paragraph(greeting) + paragraph(c.body) + button(data.resetUrl, c.cta) + paragraph(c.ignore),
  )
  return {
    subject: c.subject,
    html,
    text: `${greeting}\n\n${c.body}\n\n${data.resetUrl}\n\n${c.ignore}`,
  }
}

export function passwordChangedEmail(locale: Locale, data: { name: string }): RenderedEmail {
  const c = t.changed[locale]
  const greeting = t.welcome[locale].greeting(data.name)
  const html = layout(
    locale,
    c.subject,
    paragraph(greeting) + paragraph(c.body) + paragraph(c.warn),
  )
  return { subject: c.subject, html, text: `${greeting}\n\n${c.body}\n\n${c.warn}` }
}

export function staffInviteEmail(
  locale: Locale,
  data: { name: string; inviterName: string; setupUrl: string },
): RenderedEmail {
  const c = t.invite[locale]
  const greeting = t.welcome[locale].greeting(data.name)
  const body = c.body(data.inviterName)
  const html = layout(
    locale,
    c.subject,
    paragraph(greeting) + paragraph(body) + button(data.setupUrl, c.cta) + paragraph(c.ignore),
  )
  return {
    subject: c.subject,
    html,
    text: `${greeting}\n\n${body}\n\n${data.setupUrl}\n\n${c.ignore}`,
  }
}
