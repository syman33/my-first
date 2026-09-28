/**
 * Synthetic people and marketing data. Every name, email (RFC 2606
 * example.com) and phone number here is fictional.
 */

/** DEVELOPMENT ONLY. The seed refuses to create these accounts in production. */
export const DEV_PASSWORD = 'ChangeMe123!'
export const DEMO_CUSTOMER_PASSWORD = 'Customer123!'

export const devStaffAccounts = [
  { email: 'admin@velora.local', name: 'مدير النظام', role: 'ADMIN' as const },
  { email: 'staff@velora.local', name: 'موظف المتجر', role: 'STAFF' as const },
]

export interface SeedAddress {
  label: string
  city: string
  district: string
  street: string
  buildingNumber: string
  postalCode: string
  additionalNumber?: string
}

export interface SeedCustomer {
  email: string
  name: string
  phone: string
  locale: 'ar' | 'en'
  joinedDaysAgo: number
  addresses: SeedAddress[]
}

export const customers: SeedCustomer[] = [
  {
    email: 'noura.alotaibi@example.com',
    name: 'نورة العتيبي',
    phone: '+966500000101',
    locale: 'ar',
    joinedDaysAgo: 210,
    addresses: [
      { label: 'المنزل', city: 'الرياض', district: 'حي الملقا', street: 'طريق أنس بن مالك', buildingNumber: '8123', postalCode: '13521', additionalNumber: '2451' },
      { label: 'العمل', city: 'الرياض', district: 'حي العليا', street: 'طريق الملك فهد', buildingNumber: '7310', postalCode: '12214', additionalNumber: '3120' },
    ],
  },
  {
    email: 'sara.alqahtani@example.com',
    name: 'سارة القحطاني',
    phone: '+966500000102',
    locale: 'ar',
    joinedDaysAgo: 180,
    addresses: [{ label: 'المنزل', city: 'جدة', district: 'حي الشاطئ', street: 'شارع الأمير سلطان', buildingNumber: '6421', postalCode: '23511', additionalNumber: '8812' }],
  },
  {
    email: 'reem.alshehri@example.com',
    name: 'ريم الشهري',
    phone: '+966500000103',
    locale: 'ar',
    joinedDaysAgo: 150,
    addresses: [{ label: 'المنزل', city: 'أبها', district: 'حي المنسك', street: 'طريق الملك عبدالعزيز', buildingNumber: '4210', postalCode: '62521' }],
  },
  {
    email: 'lama.alharbi@example.com',
    name: 'لمى الحربي',
    phone: '+966500000104',
    locale: 'en',
    joinedDaysAgo: 120,
    addresses: [{ label: 'Home', city: 'الخبر', district: 'حي العقربية', street: 'شارع الأمير فيصل بن فهد', buildingNumber: '3345', postalCode: '34445', additionalNumber: '7021' }],
  },
  {
    email: 'haifa.alzahrani@example.com',
    name: 'هيفاء الزهراني',
    phone: '+966500000105',
    locale: 'ar',
    joinedDaysAgo: 95,
    addresses: [{ label: 'المنزل', city: 'مكة المكرمة', district: 'حي العزيزية', street: 'شارع الحج', buildingNumber: '5120', postalCode: '24243' }],
  },
  {
    email: 'abdullah.aldosari@example.com',
    name: 'عبدالله الدوسري',
    phone: '+966500000106',
    locale: 'ar',
    joinedDaysAgo: 80,
    addresses: [{ label: 'المنزل', city: 'الدمام', district: 'حي الفيصلية', street: 'شارع الملك سعود', buildingNumber: '2231', postalCode: '32272', additionalNumber: '4410' }],
  },
  {
    email: 'faisal.almutairi@example.com',
    name: 'فيصل المطيري',
    phone: '+966500000107',
    locale: 'ar',
    joinedDaysAgo: 60,
    addresses: [{ label: 'المنزل', city: 'الرياض', district: 'حي النرجس', street: 'شارع عثمان بن عفان', buildingNumber: '9012', postalCode: '13327', additionalNumber: '6601' }],
  },
  {
    email: 'khalid.alghamdi@example.com',
    name: 'خالد الغامدي',
    phone: '+966500000108',
    locale: 'en',
    joinedDaysAgo: 45,
    addresses: [{ label: 'Home', city: 'جدة', district: 'حي الروضة', street: 'شارع صاري', buildingNumber: '7788', postalCode: '23435' }],
  },
  {
    email: 'mohammed.alanazi@example.com',
    name: 'محمد العنزي',
    phone: '+966500000109',
    locale: 'ar',
    joinedDaysAgo: 30,
    addresses: [{ label: 'المنزل', city: 'تبوك', district: 'حي المروج', street: 'طريق الأمير فهد بن سلطان', buildingNumber: '3901', postalCode: '47913' }],
  },
  {
    email: 'yousef.alshammari@example.com',
    name: 'يوسف الشمري',
    phone: '+966500000110',
    locale: 'ar',
    joinedDaysAgo: 12,
    addresses: [{ label: 'المنزل', city: 'حائل', district: 'حي النقرة', street: 'شارع الملك عبدالعزيز', buildingNumber: '1180', postalCode: '55421' }],
  },
]

export interface SeedCoupon {
  code: string
  descriptionAr: string
  descriptionEn: string
  type: 'PERCENTAGE' | 'FIXED_AMOUNT'
  /** Percent (e.g. 10 = 10%) for PERCENTAGE, SAR for FIXED_AMOUNT. */
  value: number
  minOrderSar?: number
  maxDiscountSar?: number
  usageLimit?: number
  usageLimitPerUser?: number
  startsInDays?: number
  expiresInDays?: number
  scope?: 'ALL' | 'CATEGORIES' | 'PRODUCTS'
  categorySlugs?: string[]
  productSkus?: string[]
  isActive: boolean
}

export const coupons: SeedCoupon[] = [
  {
    code: 'VELORA10',
    descriptionAr: 'خصم 10% على طلبك (بحد أقصى 300 ر.س) للطلبات من 200 ر.س',
    descriptionEn: '10% off your order (up to SAR 300) on orders from SAR 200',
    type: 'PERCENTAGE',
    value: 10,
    minOrderSar: 200,
    maxDiscountSar: 300,
    isActive: true,
  },
  {
    code: 'WELCOME50',
    descriptionAr: 'خصم 50 ر.س على أول طلب لك من 300 ر.س',
    descriptionEn: 'SAR 50 off your first order of SAR 300 or more',
    type: 'FIXED_AMOUNT',
    value: 50,
    minOrderSar: 300,
    usageLimit: 1000,
    usageLimitPerUser: 1,
    isActive: true,
  },
  {
    code: 'BAGS15',
    descriptionAr: 'خصم 15% على الشنط للطلبات من 500 ر.س',
    descriptionEn: '15% off bags on orders from SAR 500',
    type: 'PERCENTAGE',
    value: 15,
    minOrderSar: 500,
    scope: 'CATEGORIES',
    categorySlugs: ['bags'],
    expiresInDays: 60,
    isActive: true,
  },
  {
    code: 'VIP100',
    descriptionAr: 'خصم 100 ر.س لعملاء كبار الشخصيات على الطلبات من 1000 ر.س',
    descriptionEn: 'SAR 100 off for VIP customers on orders from SAR 1,000',
    type: 'FIXED_AMOUNT',
    value: 100,
    minOrderSar: 1000,
    usageLimit: 50,
    usageLimitPerUser: 1,
    isActive: true,
  },
  {
    code: 'SUMMER25',
    descriptionAr: 'خصم الصيف 25% (منتهي)',
    descriptionEn: 'Summer 25% off (expired)',
    type: 'PERCENTAGE',
    value: 25,
    startsInDays: -120,
    expiresInDays: -30,
    isActive: true,
  },
  {
    code: 'EID20',
    descriptionAr: 'خصم العيد 20% (غير مفعّل بعد)',
    descriptionEn: 'Eid 20% off (not active yet)',
    type: 'PERCENTAGE',
    value: 20,
    maxDiscountSar: 400,
    isActive: false,
  },
]

export const banners = [
  {
    placement: 'HERO' as const,
    titleAr: 'أناقتك تبدأ من التفاصيل',
    titleEn: 'Elegance begins in the details',
    subtitleAr: 'اكتشف تشكيلتنا المختارة من الشنط والساعات والإكسسوارات للرجال والنساء.',
    subtitleEn: 'Discover our curated edit of bags, watches and accessories for women and men.',
    ctaLabelAr: 'تسوق الآن',
    ctaLabelEn: 'Shop now',
    linkUrl: '/shop',
    imageUrl: '/images/editorial/hero-desktop.webp',
    mobileImageUrl: '/images/editorial/hero-mobile.webp',
    altAr: 'حقيبة لونا السوداء مع ساعة إيلان ونظارة لوميير على منصات عرض',
    altEn: 'The black Luna bag with the Élan watch and Lumière sunglasses on display plinths',
    sortOrder: 0,
  },
  {
    placement: 'HERO' as const,
    titleAr: 'مجموعة العيد',
    titleEn: 'The Eid Edit',
    subtitleAr: 'قطع مختارة لأجمل المناسبات.',
    subtitleEn: 'Pieces chosen for the most beautiful occasions.',
    ctaLabelAr: 'اكتشف المجموعة',
    ctaLabelEn: 'Discover the edit',
    linkUrl: '/new-arrivals',
    imageUrl: '/images/editorial/promo-new.webp',
    altAr: 'حقيبة أمارا الزمردية مع تعليقة فيلورا',
    altEn: 'The emerald Amara bag with the VÉLORA bag charm',
    startsInDays: 30,
    endsInDays: 45,
    sortOrder: 1,
  },
  {
    placement: 'PROMO' as const,
    titleAr: 'عروض مختارة',
    titleEn: 'Selected offers',
    subtitleAr: 'قطع مميزة بأسعار خاصة حتى نفاد الكمية.',
    subtitleEn: 'Signature pieces at special prices, while stock lasts.',
    ctaLabelAr: 'تسوق العروض',
    ctaLabelEn: 'Shop offers',
    linkUrl: '/offers',
    imageUrl: '/images/editorial/promo-offers.webp',
    altAr: 'حقيبة ليلى بلون الكونياك مع ساعة ريفييرا',
    altEn: 'The cognac Layla bag with the Riviera chronograph',
    sortOrder: 0,
  },
  {
    placement: 'PROMO' as const,
    titleAr: 'وصل حديثاً',
    titleEn: 'Just arrived',
    subtitleAr: 'أمارا بالأخضر الزمردي، وتفاصيل جديدة تكمل إطلالتك.',
    subtitleEn: 'Amara in emerald, and new details to complete your look.',
    ctaLabelAr: 'اكتشف الجديد',
    ctaLabelEn: 'Discover what’s new',
    linkUrl: '/new-arrivals',
    imageUrl: '/images/editorial/promo-new.webp',
    altAr: 'حقيبة أمارا الزمردية',
    altEn: 'The emerald Amara bag',
    sortOrder: 1,
  },
  {
    placement: 'PROMO' as const,
    titleAr: 'ساعات بتفاصيل خالدة',
    titleEn: 'Timeless watches',
    subtitleAr: 'من الكرونوغراف الرياضي إلى الأوتوماتيكية الكلاسيكية.',
    subtitleEn: 'From sporting chronographs to classic automatics.',
    ctaLabelAr: 'تسوق الساعات',
    ctaLabelEn: 'Shop watches',
    linkUrl: '/watches',
    imageUrl: '/images/editorial/promo-watches.webp',
    altAr: 'ساعتا ريفييرا وموناكو على خلفية داكنة',
    altEn: 'The Riviera and Monaco watches on a dark background',
    sortOrder: 2,
  },
]

export const newsletterEmails = [
  { email: 'noura.alotaibi@example.com', locale: 'ar', unsubscribed: false },
  { email: 'lama.alharbi@example.com', locale: 'en', unsubscribed: false },
  { email: 'reader.one@example.com', locale: 'ar', unsubscribed: false },
  { email: 'reader.two@example.com', locale: 'ar', unsubscribed: false },
  { email: 'reader.three@example.com', locale: 'en', unsubscribed: false },
  { email: 'reader.four@example.com', locale: 'ar', unsubscribed: true },
  { email: 'reader.five@example.com', locale: 'ar', unsubscribed: false },
  { email: 'reader.six@example.com', locale: 'en', unsubscribed: false },
  { email: 'reader.seven@example.com', locale: 'ar', unsubscribed: false },
  { email: 'reader.eight@example.com', locale: 'ar', unsubscribed: true },
] as const
