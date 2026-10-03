/**
 * CMS reference content: policy pages and FAQ.
 *
 * Numbers that come from store settings are written as tokens —
 * {{standardFee}}, {{expressFee}}, {{freeShippingThreshold}}, {{codFee}},
 * {{returnWindowDays}}, {{standardDays}}, {{expressDays}} — and rendered from
 * the live settings, so policy text never contradicts the configured values.
 *
 * NOTE: legal texts (privacy, terms, returns) are professional starting
 * templates. They must be reviewed by qualified counsel before launch.
 */

export interface SeedPage {
  slug: string
  titleAr: string
  titleEn: string
  contentAr: string
  contentEn: string
  seoDescriptionAr: string
  seoDescriptionEn: string
}

export const pages: SeedPage[] = [
  {
    slug: 'about',
    titleAr: 'من نحن',
    titleEn: 'About VÉLORA',
    seoDescriptionAr:
      'فيلورا دار سعودية للأزياء والإكسسوارات الفاخرة، تجمع الحرفية العالمية بذائقة محلية معاصرة.',
    seoDescriptionEn:
      'VÉLORA is a Saudi house of luxury bags and accessories, pairing international craftsmanship with a contemporary local eye.',
    contentAr: `## أناقة تُروى بالتفاصيل

وُلدت فيلورا من فكرة بسيطة: أن القطعة الجميلة حقاً هي تلك التي تبقى معك لسنوات، وتزداد قيمتها كلما رافقتك في يومك.

نختار كل حقيبة وساعة وإكسسوار بعناية، ونعمل مع ورش ومصمّمين يشاركوننا الإيمان بأن الجودة تبدأ من الخيط والإبزيم وحافة الجلد المطلية يدوياً.

## ما يميّزنا

- **خامات منتقاة:** جلود طبيعية كاملة الحبيبات، ومعادن مطلية بعناية، وعدسات بحماية كاملة من الأشعة فوق البنفسجية.
- **تصاميم لا تبطل موضتها:** خطوط هادئة تناسب العمل والمناسبات والسفر.
- **خدمة سعودية:** فريق خدمة عملاء يتحدث لغتك، وتوصيل إلى جميع مدن المملكة.

## وعدنا لك

أن تصلك قطعتك كما رأيتها، وأن نكون معك بعد الشراء كما كنا قبله.`,
    contentEn: `## Elegance, told in the details

VÉLORA was born from a simple idea: a truly beautiful piece is one that stays with you for years and gains character every day you carry it.

We choose every bag, watch and accessory with care, working with workshops and designers who share our belief that quality starts with the thread, the buckle and the hand-painted edge.

## What sets us apart

- **Considered materials:** full-grain leathers, carefully plated metals and lenses with complete UV protection.
- **Timeless design:** quiet lines that move from the office to an evening occasion to the airport.
- **Saudi service:** a customer care team that speaks your language, and delivery across the Kingdom.

## Our promise

That your piece arrives exactly as you saw it — and that we are as present after your purchase as before it.`,
  },
  {
    slug: 'shipping',
    titleAr: 'الشحن والتوصيل',
    titleEn: 'Shipping & Delivery',
    seoDescriptionAr:
      'تعرّف على خيارات الشحن والتوصيل ورسومه ومدته إلى جميع مدن المملكة العربية السعودية.',
    seoDescriptionEn: 'Delivery options, fees and timelines for orders across Saudi Arabia.',
    contentAr: `## التوصيل داخل المملكة

نوصل طلباتك إلى جميع مدن المملكة العربية السعودية.

| طريقة الشحن | المدة المتوقعة | الرسوم |
| --- | --- | --- |
| الشحن العادي | {{standardDays}} أيام عمل | {{standardFee}} |
| الشحن السريع | {{expressDays}} أيام عمل | {{expressFee}} |

**الشحن العادي مجاني** للطلبات التي تبلغ قيمتها {{freeShippingThreshold}} أو أكثر بعد الخصم.

## تجهيز الطلب

تُجهَّز الطلبات المؤكدة عادة خلال يوم عمل واحد. تبدأ مدة التوصيل من تاريخ شحن الطلب، وقد تمتد في المواسم والعطلات الرسمية.

## الدفع عند الاستلام

تتوفر خدمة الدفع عند الاستلام للطلبات المؤهلة برسوم إضافية قدرها {{codFee}}.

## تتبّع الطلب

عند شحن طلبك يظهر رقم التتبع في صفحة الطلب ضمن حسابك، ونرسل لك إشعاراً بذلك.`,
    contentEn: `## Delivery within Saudi Arabia

We deliver to every city in the Kingdom of Saudi Arabia.

| Method | Estimated time | Fee |
| --- | --- | --- |
| Standard | {{standardDays}} business days | {{standardFee}} |
| Express | {{expressDays}} business days | {{expressFee}} |

**Standard shipping is free** on orders of {{freeShippingThreshold}} or more after discounts.

## Order preparation

Confirmed orders are usually prepared within one business day. Delivery time starts when the order ships and may be longer during peak seasons and public holidays.

## Cash on delivery

Cash on delivery is available for eligible orders for an additional fee of {{codFee}}.

## Tracking

As soon as your order ships, its tracking number appears on the order page in your account and we notify you.`,
  },
  {
    slug: 'returns',
    titleAr: 'الاستبدال والاسترجاع',
    titleEn: 'Returns & Exchanges',
    seoDescriptionAr: 'سياسة الاستبدال والاسترجاع في فيلورا وخطوات طلب الإرجاع واسترداد المبلغ.',
    seoDescriptionEn:
      'VÉLORA returns and exchanges policy, how to request a return and how refunds work.',
    contentAr: `## مدة الإرجاع

يمكنك طلب إرجاع المنتجات خلال **{{returnWindowDays}} أيام** من تاريخ الاستلام.

## شروط القبول

- أن يكون المنتج بحالته الأصلية دون استخدام، مع جميع الملصقات والتغليف والملحقات.
- ألا يكون المنتج من القطع المخصصة أو المعدّلة حسب الطلب.
- لأسباب صحية، لا يمكن إرجاع بعض المنتجات بعد فتح تغليفها إلا في حال وجود عيب مصنعي.

## كيف أطلب الإرجاع؟

1. ادخل إلى **حسابي ← طلباتي** واختر الطلب.
2. اضغط «طلب إرجاع» وحدّد المنتجات والسبب.
3. سيتواصل معك فريقنا لتأكيد الطلب وترتيب الاستلام.

## استرداد المبلغ

بعد استلام المنتج وفحصه وقبوله، يُعاد المبلغ إلى وسيلة الدفع الأصلية. قد يستغرق ظهور المبلغ في حسابك البنكي عدة أيام عمل بحسب البنك.

## المنتجات التالفة أو غير المطابقة

إذا وصلك منتج تالف أو مختلف عن طلبك، تواصل معنا خلال 48 ساعة من الاستلام وسنتكفّل بالحل كاملاً.`,
    contentEn: `## Return window

You can request a return within **{{returnWindowDays}} days** of delivery.

## Conditions

- Items must be unused and in original condition, with all tags, packaging and accessories.
- Personalised or made-to-order items cannot be returned.
- For hygiene reasons, some items cannot be returned once unsealed unless they are faulty.

## How to request a return

1. Go to **My account → Orders** and choose the order.
2. Select “Request a return”, then choose the items and the reason.
3. Our team will contact you to confirm and arrange collection.

## Refunds

Once the item is received, inspected and accepted, we refund the original payment method. Banks may take several business days to show the refund.

## Damaged or incorrect items

If an item arrives damaged or differs from your order, contact us within 48 hours of delivery and we will make it right.`,
  },
  {
    slug: 'privacy',
    titleAr: 'سياسة الخصوصية',
    titleEn: 'Privacy Policy',
    seoDescriptionAr: 'كيف تجمع فيلورا بياناتك الشخصية وتستخدمها وتحميها.',
    seoDescriptionEn: 'How VÉLORA collects, uses and protects your personal data.',
    contentAr: `## البيانات التي نجمعها

- **بيانات الحساب:** الاسم والبريد الإلكتروني ورقم الجوال.
- **بيانات الطلب:** عناوين التوصيل والمنتجات المشتراة وسجل الطلبات.
- **بيانات الدفع:** تتم عمليات الدفع عبر مزوّد دفع مرخّص، **ولا نخزّن بيانات بطاقتك** على خوادمنا.
- **بيانات تقنية:** بيانات ضرورية لتشغيل الموقع وحمايته مثل سجلات الأمان.

## كيف نستخدم بياناتك

لتنفيذ طلباتك وتوصيلها، والتواصل معك بشأنها، وحماية حسابك من الاحتيال، وتحسين خدماتنا. لا نرسل لك رسائل تسويقية إلا بموافقتك، ويمكنك إلغاء الاشتراك في أي وقت.

## مشاركة البيانات

نشارك الحد الأدنى اللازم من البيانات مع مزوّد الدفع وشركات الشحن لتنفيذ طلبك فقط، ولا نبيع بياناتك لأي طرف.

## ملفات تعريف الارتباط

نستخدم ملفات ضرورية فقط لتسجيل الدخول وحفظ سلة التسوق واللغة المفضلة.

## حقوقك

يحق لك الاطلاع على بياناتك وتصحيحها وطلب حذفها وفق نظام حماية البيانات الشخصية في المملكة العربية السعودية. للتواصل بشأن الخصوصية راسلنا عبر صفحة «تواصل معنا».`,
    contentEn: `## Data we collect

- **Account data:** name, email address and mobile number.
- **Order data:** delivery addresses, purchased items and order history.
- **Payment data:** payments are processed by a licensed payment provider — **we never store your card details** on our servers.
- **Technical data:** information needed to run and secure the site, such as security logs.

## How we use it

To fulfil and deliver your orders, contact you about them, protect your account from fraud and improve our service. We only send marketing messages with your consent, and you can unsubscribe at any time.

## Sharing

We share only the minimum data needed with our payment provider and delivery partners to fulfil your order. We never sell your data.

## Cookies

We use only essential cookies: to keep you signed in and to remember your bag and preferred language.

## Your rights

You may access, correct or request deletion of your data in line with the Saudi Personal Data Protection Law. For privacy requests, reach us through the Contact page.`,
  },
  {
    slug: 'terms',
    titleAr: 'الشروط والأحكام',
    titleEn: 'Terms & Conditions',
    seoDescriptionAr: 'الشروط والأحكام المنظمة لاستخدام متجر فيلورا والشراء منه.',
    seoDescriptionEn: 'The terms governing use of and purchases from the VÉLORA store.',
    contentAr: `## القبول

باستخدامك للمتجر أو إتمامك لطلب فإنك توافق على هذه الشروط.

## الأسعار والطلبات

- الأسعار المعروضة بالريال السعودي، وتشمل ضريبة القيمة المضافة متى ما أشير إلى ذلك.
- يُعدّ الطلب مؤكداً بعد نجاح الدفع أو تأكيد طلب الدفع عند الاستلام.
- نحتفظ بحق إلغاء الطلب في حال عدم توفر المنتج أو وجود خطأ واضح في السعر، مع إعادة أي مبلغ مدفوع كاملاً.

## الدفع

تتم المدفوعات الإلكترونية عبر مزوّد دفع مرخّص وآمن، ولا يتم تأكيد الطلب إلا بعد التحقق من نجاح الدفع.

## الإلغاء

يمكنك إلغاء طلبك من حسابك قبل شحنه. بعد الشحن تنطبق سياسة الاستبدال والاسترجاع.

## الملكية الفكرية

جميع المحتويات والتصاميم والشعارات في هذا المتجر مملوكة لفيلورا ولا يجوز استخدامها دون إذن كتابي.

## النظام الحاكم

تخضع هذه الشروط لأنظمة المملكة العربية السعودية.`,
    contentEn: `## Acceptance

By using the store or placing an order you agree to these terms.

## Prices and orders

- Prices are in Saudi Riyals and include VAT where indicated.
- An order is confirmed once payment succeeds, or once a cash-on-delivery order is confirmed.
- We may cancel an order if an item is unavailable or a price is clearly wrong, refunding any amount paid in full.

## Payment

Online payments are processed by a licensed, secure payment provider. An order is only confirmed after the payment has been verified.

## Cancellation

You can cancel an order from your account before it ships. After shipment, our returns policy applies.

## Intellectual property

All content, designs and logos on this store belong to VÉLORA and may not be used without written permission.

## Governing law

These terms are governed by the laws of the Kingdom of Saudi Arabia.`,
  },
]

export const faqItems = [
  {
    questionAr: 'كم تستغرق مدة التوصيل؟',
    questionEn: 'How long does delivery take?',
    answerAr:
      'الشحن العادي يستغرق {{standardDays}} أيام عمل، والشحن السريع {{expressDays}} أيام عمل من تاريخ الشحن.',
    answerEn:
      'Standard delivery takes {{standardDays}} business days and express {{expressDays}} business days from dispatch.',
  },
  {
    questionAr: 'هل الشحن مجاني؟',
    questionEn: 'Is shipping free?',
    answerAr:
      'نعم، الشحن العادي مجاني للطلبات التي تبلغ {{freeShippingThreshold}} أو أكثر بعد الخصم.',
    answerEn:
      'Yes — standard shipping is free on orders of {{freeShippingThreshold}} or more after discounts.',
  },
  {
    questionAr: 'ما طرق الدفع المتاحة؟',
    questionEn: 'Which payment methods do you accept?',
    answerAr:
      'نقبل بطاقات مدى وفيزا وماستركارد وApple Pay، إضافة إلى الدفع عند الاستلام للطلبات المؤهلة.',
    answerEn:
      'We accept mada, Visa, Mastercard and Apple Pay, plus cash on delivery for eligible orders.',
  },
  {
    questionAr: 'هل يتوفر الدفع عند الاستلام؟',
    questionEn: 'Do you offer cash on delivery?',
    answerAr: 'نعم، للطلبات المؤهلة وبرسوم إضافية قدرها {{codFee}}.',
    answerEn: 'Yes, for eligible orders, with an additional fee of {{codFee}}.',
  },
  {
    questionAr: 'كيف أتتبع طلبي؟',
    questionEn: 'How do I track my order?',
    answerAr: 'من «حسابي ← طلباتي» ستجد حالة الطلب ورقم التتبع بمجرد شحنه.',
    answerEn:
      'Under “My account → Orders” you will find your order status and tracking number once it ships.',
  },
  {
    questionAr: 'هل يمكنني إلغاء طلبي؟',
    questionEn: 'Can I cancel my order?',
    answerAr:
      'يمكنك إلغاء الطلب من صفحة الطلب قبل شحنه. بعد الشحن يمكنك طلب إرجاع وفق سياسة الاسترجاع.',
    answerEn:
      'You can cancel from the order page before it ships. After shipment you can request a return under our returns policy.',
  },
  {
    questionAr: 'ما مدة الإرجاع؟',
    questionEn: 'What is your return window?',
    answerAr:
      'يمكنك طلب الإرجاع خلال {{returnWindowDays}} أيام من الاستلام، بشرط أن يكون المنتج بحالته الأصلية.',
    answerEn:
      'You can request a return within {{returnWindowDays}} days of delivery, provided the item is in original condition.',
  },
  {
    questionAr: 'هل منتجاتكم أصلية؟',
    questionEn: 'Are your products authentic?',
    answerAr: 'نعم، جميع منتجاتنا من تشكيلاتنا ومن ورش وموردين معتمدين، وتصلك مع تغليفها الأصلي.',
    answerEn:
      'Yes. Every piece comes from our own collections or approved workshops and suppliers, in its original packaging.',
  },
  {
    questionAr: 'هل أحتاج إلى حساب لإتمام الشراء؟',
    questionEn: 'Do I need an account to check out?',
    answerAr:
      'يمكنك التصفح وإضافة المنتجات إلى السلة دون حساب، ونطلب تسجيل الدخول عند إتمام الطلب لحماية طلبك ومتابعته بسهولة.',
    answerEn:
      'You can browse and add to your bag without an account; we ask you to sign in at checkout so your order is protected and easy to follow.',
  },
  {
    questionAr: 'هل أحصل على فاتورة ضريبية؟',
    questionEn: 'Will I receive a tax invoice?',
    answerAr: 'يمكنك عرض فاتورة طلبك وطباعتها في أي وقت من صفحة الطلب في حسابك.',
    answerEn:
      'You can view and print your order invoice at any time from the order page in your account.',
  },
]
