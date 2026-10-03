/**
 * Synthetic demo catalogue. All brands, products and copy are fictional.
 * Prices are in SAR here for readability and converted to halalas by the seed.
 */

export type ArtKind =
  | 'bag-shoulder'
  | 'bag-mini'
  | 'bag-crossbody'
  | 'bag-tote'
  | 'bag-clutch'
  | 'bag-bucket'
  | 'bag-top-handle'
  | 'bag-hobo'
  | 'bag-weekender'
  | 'bag-messenger'
  | 'watch-leather'
  | 'watch-bracelet'
  | 'watch-chrono'
  | 'watch-mesh'
  | 'wallet-bifold'
  | 'wallet-card'
  | 'wallet-long'
  | 'wallet-travel'
  | 'belt-classic'
  | 'belt-slim'
  | 'belt-chain'
  | 'sunglasses-cateye'
  | 'sunglasses-aviator'
  | 'sunglasses-round'
  | 'sunglasses-square'
  | 'bangle'
  | 'cufflinks'
  | 'scarf'
  | 'charm'

export type Metal = 'gold' | 'silver' | 'rose'

export interface SeedVariant {
  suffix: string
  colorFamily:
    | 'BLACK'
    | 'WHITE'
    | 'BEIGE'
    | 'BROWN'
    | 'TAN'
    | 'GREY'
    | 'NAVY'
    | 'BLUE'
    | 'GREEN'
    | 'RED'
    | 'PINK'
    | 'GOLD'
    | 'SILVER'
    | 'ROSE_GOLD'
    | 'MULTI'
  colorEn: string
  colorAr: string
  /** Main material colour used by the image generator and the colour swatch. */
  hex: string
  /** Hardware / case metal. */
  metal: Metal
  /** Secondary tone: watch dial, lens tint, lining, scarf pattern. */
  accent?: string
  size?: string
  stock: number
  price?: number
  compareAt?: number
}

export interface SeedProduct {
  sku: string
  nameEn: string
  nameAr: string
  category: string
  brand: string
  gender: 'WOMEN' | 'MEN' | 'UNISEX'
  price: number
  compareAt?: number
  cost: number
  art: ArtKind
  materialEn: string
  materialAr: string
  dimensionsMm?: [number, number, number]
  weightGrams?: number
  descriptionEn: string
  descriptionAr: string
  careEn: string
  careAr: string
  featured?: boolean
  bestseller?: boolean
  newArrival?: boolean
  /** Days since publication (drives "newest" ordering in the demo). */
  ageDays: number
  salesCount: number
  variants: SeedVariant[]
}

export interface SeedCategory {
  slug: string
  nameEn: string
  nameAr: string
  descriptionEn: string
  descriptionAr: string
  kind: 'STANDARD' | 'GENDER' | 'NEW_ARRIVALS' | 'BEST_SELLERS' | 'OFFERS'
  gender?: 'WOMEN' | 'MEN'
  parent?: string
  sortOrder: number
  showInNav: boolean
}

export const categories: SeedCategory[] = [
  {
    slug: 'women',
    nameEn: 'Women',
    nameAr: 'النساء',
    descriptionEn: 'Bags, watches and finishing touches chosen for her.',
    descriptionAr: 'شنط وساعات ولمسات أخيرة مختارة لها بعناية.',
    kind: 'GENDER',
    gender: 'WOMEN',
    sortOrder: 1,
    showInNav: true,
  },
  {
    slug: 'men',
    nameEn: 'Men',
    nameAr: 'الرجال',
    descriptionEn: 'Timepieces, leather goods and accessories with quiet confidence.',
    descriptionAr: 'ساعات ومنتجات جلدية وإكسسوارات بثقة هادئة.',
    kind: 'GENDER',
    gender: 'MEN',
    sortOrder: 2,
    showInNav: true,
  },
  {
    slug: 'bags',
    nameEn: 'Bags',
    nameAr: 'الشنط',
    descriptionEn: 'Shoulder bags, totes, crossbodies and evening clutches in fine leather.',
    descriptionAr: 'شنط كتف وتوت وكروس وحقائب سهرة من أجود أنواع الجلد.',
    kind: 'STANDARD',
    sortOrder: 3,
    showInNav: true,
  },
  {
    slug: 'watches',
    nameEn: 'Watches',
    nameAr: 'الساعات',
    descriptionEn: 'Refined timepieces, from minimalist dials to classic automatics.',
    descriptionAr: 'ساعات راقية، من التصاميم البسيطة إلى الأوتوماتيكية الكلاسيكية.',
    kind: 'STANDARD',
    sortOrder: 4,
    showInNav: true,
  },
  {
    slug: 'accessories',
    nameEn: 'Accessories',
    nameAr: 'الإكسسوارات',
    descriptionEn: 'Wallets, belts, sunglasses and jewellery to complete every look.',
    descriptionAr: 'محافظ وأحزمة ونظارات شمسية ومجوهرات تكمل كل إطلالة.',
    kind: 'STANDARD',
    sortOrder: 5,
    showInNav: true,
  },
  {
    slug: 'wallets',
    nameEn: 'Wallets',
    nameAr: 'المحافظ',
    descriptionEn: 'Wallets and card holders crafted to age beautifully.',
    descriptionAr: 'محافظ وحافظات بطاقات مصنوعة لتزداد جمالاً مع الوقت.',
    kind: 'STANDARD',
    parent: 'accessories',
    sortOrder: 1,
    showInNav: false,
  },
  {
    slug: 'belts',
    nameEn: 'Belts',
    nameAr: 'الأحزمة',
    descriptionEn: 'Leather and chain belts with signature hardware.',
    descriptionAr: 'أحزمة جلدية ومعدنية بإبزيم مميز.',
    kind: 'STANDARD',
    parent: 'accessories',
    sortOrder: 2,
    showInNav: false,
  },
  {
    slug: 'sunglasses',
    nameEn: 'Sunglasses',
    nameAr: 'النظارات الشمسية',
    descriptionEn: 'UV400 protection with timeless frames.',
    descriptionAr: 'حماية كاملة من الأشعة فوق البنفسجية بإطارات لا تبطل موضتها.',
    kind: 'STANDARD',
    parent: 'accessories',
    sortOrder: 3,
    showInNav: false,
  },
  {
    slug: 'jewellery',
    nameEn: 'Jewellery',
    nameAr: 'المجوهرات',
    descriptionEn: 'Bangles, cufflinks, scarves and charms — small details, lasting impression.',
    descriptionAr: 'أساور وأزرار أكمام ووشاحات وتعليقات — تفاصيل صغيرة وانطباع يدوم.',
    kind: 'STANDARD',
    parent: 'accessories',
    sortOrder: 4,
    showInNav: false,
  },
  {
    slug: 'new-arrivals',
    nameEn: 'New Arrivals',
    nameAr: 'وصل حديثاً',
    descriptionEn: 'The latest pieces to join the VÉLORA edit.',
    descriptionAr: 'أحدث القطع التي انضمت إلى تشكيلة فيلورا.',
    kind: 'NEW_ARRIVALS',
    sortOrder: 6,
    showInNav: true,
  },
  {
    slug: 'best-sellers',
    nameEn: 'Best Sellers',
    nameAr: 'الأكثر مبيعاً',
    descriptionEn: 'The pieces our customers return to again and again.',
    descriptionAr: 'القطع التي يعود إليها عملاؤنا مرة بعد مرة.',
    kind: 'BEST_SELLERS',
    sortOrder: 7,
    showInNav: false,
  },
  {
    slug: 'offers',
    nameEn: 'Offers',
    nameAr: 'العروض',
    descriptionEn: 'Selected pieces at special prices, while stock lasts.',
    descriptionAr: 'قطع مختارة بأسعار خاصة، حتى نفاد الكمية.',
    kind: 'OFFERS',
    sortOrder: 8,
    showInNav: true,
  },
]

export const brands = [
  { slug: 'velora-atelier', nameEn: 'VÉLORA Atelier', nameAr: 'فيلورا أتيليه' },
  { slug: 'maison-sahar', nameEn: 'Maison Sahar', nameAr: 'ميزون سحر' },
  { slug: 'atlas-horology', nameEn: 'Atlas Horology', nameAr: 'أطلس للساعات' },
  { slug: 'riviera-optics', nameEn: 'Riviera Optics', nameAr: 'ريفييرا للنظارات' },
  { slug: 'noor-studio', nameEn: 'Noor Studio', nameAr: 'نور ستوديو' },
] as const

const LEATHER_CARE_EN =
  'Wipe with a soft dry cloth. Keep away from direct sunlight, heat and moisture. Store in the dust bag provided and stuff lightly to hold the shape.'
const LEATHER_CARE_AR =
  'امسحيها بقطعة قماش ناعمة وجافة، وأبعديها عن أشعة الشمس المباشرة والحرارة والرطوبة. احفظيها في كيس الحفظ المرفق مع حشوها بخفة للحفاظ على شكلها.'
const LEATHER_CARE_AR_M =
  'امسحها بقطعة قماش ناعمة وجافة، وأبعدها عن الحرارة والرطوبة. احفظها في كيسها الأصلي عند عدم الاستخدام.'
const WATCH_CARE_EN =
  'Water resistant to 50 m (5 ATM) — suitable for splashes, not for diving. Avoid magnets and perfume on the strap. Service every three to five years.'
const WATCH_CARE_AR =
  'مقاومة للماء حتى 50 متراً (5 ATM) — مناسبة للرذاذ وليست للغوص. أبعدها عن المغناطيس وتجنّب رش العطر على السوار. يُنصح بصيانتها كل ثلاث إلى خمس سنوات.'
const SUN_CARE_EN =
  'Clean lenses with the microfibre cloth provided. Store in the hard case and avoid leaving in a hot car.'
const SUN_CARE_AR =
  'نظّف العدسات بقطعة المايكروفايبر المرفقة، واحفظ النظارة في علبتها الصلبة، وتجنّب تركها داخل السيارة في الحر.'
const METAL_CARE_EN =
  'Polish gently with a soft cloth. Avoid contact with perfume, lotions and chlorinated water.'
const METAL_CARE_AR =
  'نظّفها بلطف بقطعة قماش ناعمة، وتجنّب ملامستها للعطور والكريمات والماء المعالج بالكلور.'

export const products: SeedProduct[] = [
  // ---------------------------------------------------------------- Bags
  {
    sku: 'VLR-BAG-LUNA',
    nameEn: 'Luna Shoulder Bag',
    nameAr: 'حقيبة لونا الكتفية',
    category: 'bags',
    brand: 'velora-atelier',
    gender: 'WOMEN',
    price: 1290,
    cost: 480,
    art: 'bag-shoulder',
    materialEn: 'Smooth calf leather, suede lining',
    materialAr: 'جلد عجل ناعم مع بطانة من الشامواه',
    dimensionsMm: [260, 90, 170],
    weightGrams: 620,
    descriptionEn:
      'Our signature shoulder bag, cut from smooth calf leather with a sculpted flap and the brushed V clasp. The adjustable strap sits comfortably on the shoulder, while the suede-lined interior keeps a phone, cardholder and keys neatly in place.',
    descriptionAr:
      'حقيبتنا الكتفية الأيقونية، مصنوعة من جلد العجل الناعم بغطاء منحوت وقفل V المصقول. حزامها القابل للتعديل يستقر براحة على الكتف، وبطانتها من الشامواه تحتضن هاتفك وبطاقاتك ومفاتيحك بترتيب أنيق.',
    careEn: LEATHER_CARE_EN,
    careAr: LEATHER_CARE_AR,
    featured: true,
    bestseller: true,
    ageDays: 120,
    salesCount: 184,
    variants: [
      {
        suffix: 'BLK',
        colorFamily: 'BLACK',
        colorEn: 'Black',
        colorAr: 'أسود',
        hex: '#1c1b1a',
        metal: 'gold',
        stock: 24,
      },
      {
        suffix: 'COG',
        colorFamily: 'BROWN',
        colorEn: 'Cognac',
        colorAr: 'كونياك',
        hex: '#8a4f2a',
        metal: 'gold',
        stock: 12,
      },
      {
        suffix: 'IVR',
        colorFamily: 'BEIGE',
        colorEn: 'Ivory',
        colorAr: 'عاجي',
        hex: '#e9e0cf',
        metal: 'gold',
        stock: 3,
      },
    ],
  },
  {
    sku: 'VLR-BAG-AURELIA',
    nameEn: 'Aurelia Mini Bag',
    nameAr: 'حقيبة أوريليا الصغيرة',
    category: 'bags',
    brand: 'maison-sahar',
    gender: 'WOMEN',
    price: 890,
    compareAt: 1090,
    cost: 330,
    art: 'bag-mini',
    materialEn: 'Pebbled leather, gold-tone chain',
    materialAr: 'جلد محبّب مع سلسلة بلون ذهبي',
    dimensionsMm: [180, 70, 130],
    weightGrams: 410,
    descriptionEn:
      'A compact top-handle bag for evenings and weekends. Pebbled leather resists everyday marks, and the detachable chain lets you carry it by hand or across the body.',
    descriptionAr:
      'حقيبة صغيرة بمقبض علوي للسهرات وعطلات نهاية الأسبوع. جلدها المحبّب يقاوم آثار الاستخدام اليومي، وسلسلتها القابلة للفصل تمنحك حرية حملها باليد أو على الجسم.',
    careEn: LEATHER_CARE_EN,
    careAr: LEATHER_CARE_AR,
    newArrival: true,
    ageDays: 12,
    salesCount: 57,
    variants: [
      {
        suffix: 'ROS',
        colorFamily: 'PINK',
        colorEn: 'Rose',
        colorAr: 'وردي',
        hex: '#d9a3a0',
        metal: 'gold',
        stock: 9,
      },
      {
        suffix: 'BLK',
        colorFamily: 'BLACK',
        colorEn: 'Black',
        colorAr: 'أسود',
        hex: '#1d1c1b',
        metal: 'gold',
        stock: 15,
      },
      {
        suffix: 'SND',
        colorFamily: 'BEIGE',
        colorEn: 'Sand',
        colorAr: 'رملي',
        hex: '#cdb89b',
        metal: 'gold',
        stock: 0,
      },
    ],
  },
  {
    sku: 'VLR-BAG-NOIR',
    nameEn: 'Noir Crossbody',
    nameAr: 'حقيبة نوار كروس',
    category: 'bags',
    brand: 'velora-atelier',
    gender: 'WOMEN',
    price: 760,
    cost: 280,
    art: 'bag-crossbody',
    materialEn: 'Box calf leather',
    materialAr: 'جلد عجل مصقول',
    dimensionsMm: [210, 60, 150],
    weightGrams: 450,
    descriptionEn:
      'Clean lines and a hands-free fit. The Noir crossbody has two slim compartments, a magnetic closure and a strap that adjusts from shoulder to cross-body length.',
    descriptionAr:
      'خطوط نظيفة وحرية للحركة. تضم حقيبة نوار حجرتين نحيفتين وإغلاقاً مغناطيسياً وحزاماً يُضبط ليناسب الكتف أو الحمل على الجسم.',
    careEn: LEATHER_CARE_EN,
    careAr: LEATHER_CARE_AR,
    bestseller: true,
    ageDays: 200,
    salesCount: 146,
    variants: [
      {
        suffix: 'BLK',
        colorFamily: 'BLACK',
        colorEn: 'Black',
        colorAr: 'أسود',
        hex: '#191818',
        metal: 'silver',
        stock: 30,
      },
      {
        suffix: 'BRG',
        colorFamily: 'RED',
        colorEn: 'Burgundy',
        colorAr: 'خمري',
        hex: '#5e1f28',
        metal: 'gold',
        stock: 7,
      },
    ],
  },
  {
    sku: 'VLR-BAG-SIENNA',
    nameEn: 'Sienna Tote',
    nameAr: 'حقيبة سيينا توت',
    category: 'bags',
    brand: 'maison-sahar',
    gender: 'WOMEN',
    price: 1450,
    cost: 540,
    art: 'bag-tote',
    materialEn: 'Full-grain leather, cotton twill lining',
    materialAr: 'جلد طبيعي كامل الحبيبات مع بطانة قطنية',
    dimensionsMm: [360, 140, 290],
    weightGrams: 980,
    descriptionEn:
      'A generous tote that carries a laptop, a scarf and everything in between. Reinforced handles, a zipped inner pocket and a structured base keep it elegant from office to airport.',
    descriptionAr:
      'حقيبة توت واسعة تتسع لحاسوبك المحمول ووشاحك وكل ما بينهما. مقابض مدعّمة وجيب داخلي بسحاب وقاعدة متماسكة تحافظ على أناقتها من المكتب حتى المطار.',
    careEn: LEATHER_CARE_EN,
    careAr: LEATHER_CARE_AR,
    featured: true,
    ageDays: 90,
    salesCount: 98,
    variants: [
      {
        suffix: 'TAN',
        colorFamily: 'TAN',
        colorEn: 'Tan',
        colorAr: 'بني فاتح',
        hex: '#b07a4a',
        metal: 'gold',
        accent: '#e8dcc6',
        stock: 11,
      },
      {
        suffix: 'TPE',
        colorFamily: 'GREY',
        colorEn: 'Taupe',
        colorAr: 'رمادي دافئ',
        hex: '#8b7d72',
        metal: 'silver',
        accent: '#e8dcc6',
        stock: 6,
      },
      {
        suffix: 'BLK',
        colorFamily: 'BLACK',
        colorEn: 'Black',
        colorAr: 'أسود',
        hex: '#1b1a19',
        metal: 'gold',
        accent: '#d8cdb9',
        stock: 18,
      },
    ],
  },
  {
    sku: 'VLR-BAG-CELESTE',
    nameEn: 'Céleste Evening Clutch',
    nameAr: 'حقيبة سيليست للسهرة',
    category: 'bags',
    brand: 'noor-studio',
    gender: 'WOMEN',
    price: 640,
    cost: 230,
    art: 'bag-clutch',
    materialEn: 'Satin-finish leather, metal frame',
    materialAr: 'جلد بلمسة ساتان مع إطار معدني',
    dimensionsMm: [240, 40, 120],
    weightGrams: 300,
    descriptionEn:
      'An envelope clutch with a softly lustrous finish, made for weddings and evening occasions. A slim hidden chain tucks inside when you prefer to hold it.',
    descriptionAr:
      'حقيبة سهرة بتصميم الظرف ولمعة هادئة، صُممت للأعراس والمناسبات المسائية. تخفي سلسلة رفيعة يمكن طيّها داخلها حين تفضّلين حملها باليد.',
    careEn: LEATHER_CARE_EN,
    careAr: LEATHER_CARE_AR,
    newArrival: true,
    ageDays: 8,
    salesCount: 31,
    variants: [
      {
        suffix: 'GLD',
        colorFamily: 'GOLD',
        colorEn: 'Gold',
        colorAr: 'ذهبي',
        hex: '#c9a86a',
        metal: 'gold',
        stock: 10,
      },
      {
        suffix: 'CHM',
        colorFamily: 'BEIGE',
        colorEn: 'Champagne',
        colorAr: 'شمبانيا',
        hex: '#e2cfae',
        metal: 'gold',
        stock: 8,
      },
      {
        suffix: 'BLK',
        colorFamily: 'BLACK',
        colorEn: 'Black',
        colorAr: 'أسود',
        hex: '#171616',
        metal: 'silver',
        stock: 12,
      },
    ],
  },
  {
    sku: 'VLR-BAG-DUNE',
    nameEn: 'Dune Bucket Bag',
    nameAr: 'حقيبة ديون الأسطوانية',
    category: 'bags',
    brand: 'maison-sahar',
    gender: 'WOMEN',
    price: 980,
    cost: 360,
    art: 'bag-bucket',
    materialEn: 'Nubuck leather, drawstring closure',
    materialAr: 'جلد نوبوك مع إغلاق برباط',
    dimensionsMm: [220, 180, 250],
    weightGrams: 560,
    descriptionEn:
      'Inspired by the soft curves of the dunes at dusk. The drawstring bucket shape opens wide for easy access and cinches closed with a single pull.',
    descriptionAr:
      'مستوحاة من انحناءات الكثبان الرملية عند الغروب. تصميمها الأسطواني برباط يُفتح على اتساعه لسهولة الوصول، ويُغلق بسحبة واحدة.',
    careEn: LEATHER_CARE_EN,
    careAr: LEATHER_CARE_AR,
    ageDays: 150,
    salesCount: 44,
    variants: [
      {
        suffix: 'SND',
        colorFamily: 'BEIGE',
        colorEn: 'Sand',
        colorAr: 'رملي',
        hex: '#c7ae8c',
        metal: 'gold',
        stock: 9,
      },
      {
        suffix: 'OLV',
        colorFamily: 'GREEN',
        colorEn: 'Olive',
        colorAr: 'زيتي',
        hex: '#5c5f3c',
        metal: 'gold',
        stock: 2,
      },
    ],
  },
  {
    sku: 'VLR-BAG-AMARA',
    nameEn: 'Amara Top-Handle Bag',
    nameAr: 'حقيبة أمارا بمقبض علوي',
    category: 'bags',
    brand: 'velora-atelier',
    gender: 'WOMEN',
    price: 1690,
    cost: 620,
    art: 'bag-top-handle',
    materialEn: 'Saffiano leather, palladium hardware',
    materialAr: 'جلد سافيانو مع قطع معدنية من البلاديوم',
    dimensionsMm: [280, 120, 210],
    weightGrams: 840,
    descriptionEn:
      'Architectural and assured. Amara pairs a rigid saffiano body with a rolled top handle and a detachable shoulder strap — a bag that holds its form for years.',
    descriptionAr:
      'حضور معماري واثق. تجمع أمارا بين هيكل متماسك من جلد السافيانو ومقبض علوي ملفوف وحزام كتف قابل للفصل، حقيبة تحافظ على شكلها لسنوات.',
    careEn: LEATHER_CARE_EN,
    careAr: LEATHER_CARE_AR,
    featured: true,
    newArrival: true,
    ageDays: 5,
    salesCount: 22,
    variants: [
      {
        suffix: 'BLK',
        colorFamily: 'BLACK',
        colorEn: 'Black',
        colorAr: 'أسود',
        hex: '#1a1919',
        metal: 'silver',
        stock: 8,
      },
      {
        suffix: 'EMR',
        colorFamily: 'GREEN',
        colorEn: 'Emerald',
        colorAr: 'زمردي',
        hex: '#1f4d3f',
        metal: 'gold',
        stock: 5,
      },
    ],
  },
  {
    sku: 'VLR-BAG-LAYLA',
    nameEn: 'Layla Hobo Bag',
    nameAr: 'حقيبة ليلى الهوبو',
    category: 'bags',
    brand: 'noor-studio',
    gender: 'WOMEN',
    price: 1150,
    compareAt: 1390,
    cost: 410,
    art: 'bag-hobo',
    materialEn: 'Supple lambskin',
    materialAr: 'جلد حمل طري',
    dimensionsMm: [330, 110, 240],
    weightGrams: 520,
    descriptionEn:
      'A slouchy hobo in buttery lambskin that softens beautifully with wear. One roomy compartment, an inner zip pocket and a crescent silhouette that drapes against the body.',
    descriptionAr:
      'حقيبة هوبو مرنة من جلد الحمل الطري تزداد نعومة مع الاستخدام. حجرة واسعة وجيب داخلي بسحاب وشكل هلالي ينسدل بانسيابية على الجسم.',
    careEn: LEATHER_CARE_EN,
    careAr: LEATHER_CARE_AR,
    ageDays: 240,
    salesCount: 73,
    variants: [
      {
        suffix: 'COG',
        colorFamily: 'BROWN',
        colorEn: 'Cognac',
        colorAr: 'كونياك',
        hex: '#96552c',
        metal: 'gold',
        stock: 6,
      },
      {
        suffix: 'CRM',
        colorFamily: 'BEIGE',
        colorEn: 'Cream',
        colorAr: 'كريمي',
        hex: '#e6dac3',
        metal: 'gold',
        stock: 4,
      },
    ],
  },
  {
    sku: 'VLR-BAG-OASIS',
    nameEn: 'Oasis Weekender',
    nameAr: 'حقيبة أوايسس للسفر',
    category: 'bags',
    brand: 'velora-atelier',
    gender: 'UNISEX',
    price: 1890,
    cost: 700,
    art: 'bag-weekender',
    materialEn: 'Waxed canvas with leather trims',
    materialAr: 'قماش كانفاس مشمّع مع أطراف جلدية',
    dimensionsMm: [500, 240, 300],
    weightGrams: 1450,
    descriptionEn:
      'Sized for a long weekend in AlUla or a business trip to Jeddah. Water-resistant waxed canvas, full-grain leather handles and a separate shoe compartment.',
    descriptionAr:
      'بالحجم المثالي لعطلة طويلة في العُلا أو رحلة عمل إلى جدة. قماش كانفاس مشمّع مقاوم للماء ومقابض من الجلد الطبيعي وحجرة منفصلة للأحذية.',
    careEn:
      'Brush off dust and spot clean with a damp cloth. Re-wax the canvas once a year to maintain water resistance.',
    careAr:
      'أزل الغبار بالفرشاة ونظّف البقع بقطعة قماش رطبة. أعد تشميع القماش مرة سنوياً للحفاظ على مقاومته للماء.',
    ageDays: 60,
    salesCount: 38,
    variants: [
      {
        suffix: 'TAN',
        colorFamily: 'TAN',
        colorEn: 'Tan',
        colorAr: 'بني فاتح',
        hex: '#a9855b',
        metal: 'gold',
        accent: '#6b4a2f',
        stock: 7,
      },
      {
        suffix: 'NVY',
        colorFamily: 'NAVY',
        colorEn: 'Navy',
        colorAr: 'كحلي',
        hex: '#243349',
        metal: 'silver',
        accent: '#6b4a2f',
        stock: 5,
      },
    ],
  },
  {
    sku: 'VLR-BAG-METRO',
    nameEn: 'Metro Messenger',
    nameAr: 'حقيبة ميترو ماسنجر',
    category: 'bags',
    brand: 'velora-atelier',
    gender: 'MEN',
    price: 1090,
    cost: 400,
    art: 'bag-messenger',
    materialEn: 'Vegetable-tanned leather',
    materialAr: 'جلد مدبوغ نباتياً',
    dimensionsMm: [380, 90, 280],
    weightGrams: 1100,
    descriptionEn:
      'A modern messenger with a padded sleeve for a 14-inch laptop, a flap that closes with twin magnetic clasps, and leather that develops a rich patina over time.',
    descriptionAr:
      'حقيبة ماسنجر عصرية بجيب مبطّن لحاسوب 14 إنش وغطاء يُغلق بقفلين مغناطيسيين، من جلد يكتسب لمعة غنية مع مرور الوقت.',
    careEn: LEATHER_CARE_EN,
    careAr: LEATHER_CARE_AR_M,
    ageDays: 170,
    salesCount: 61,
    variants: [
      {
        suffix: 'BLK',
        colorFamily: 'BLACK',
        colorEn: 'Black',
        colorAr: 'أسود',
        hex: '#1c1c1c',
        metal: 'silver',
        stock: 10,
      },
      {
        suffix: 'BRN',
        colorFamily: 'BROWN',
        colorEn: 'Dark Brown',
        colorAr: 'بني داكن',
        hex: '#4a2e1f',
        metal: 'gold',
        stock: 8,
      },
    ],
  },
  // ---------------------------------------------------------------- Watches
  {
    sku: 'VLR-WCH-ELAN',
    nameEn: 'Élan Watch',
    nameAr: 'ساعة إيلان',
    category: 'watches',
    brand: 'atlas-horology',
    gender: 'WOMEN',
    price: 1850,
    cost: 690,
    art: 'watch-leather',
    materialEn: 'Stainless steel case, Italian leather strap, sapphire-coated crystal',
    materialAr: 'هيكل من الفولاذ المقاوم للصدأ، سوار جلد إيطالي، وزجاج مطلي بالسافير',
    dimensionsMm: [32, 32, 8],
    weightGrams: 45,
    descriptionEn:
      'A slim 32 mm case with a sunray dial and applied indices that catch the light with every movement. Swiss quartz precision on a strap that softens to your wrist.',
    descriptionAr:
      'هيكل نحيف بقطر 32 مم وميناء بلمعة شعاعية ومؤشرات بارزة تلتقط الضوء مع كل حركة. دقة كوارتز سويسرية على سوار يتشكّل بنعومة حول معصمك.',
    careEn: WATCH_CARE_EN,
    careAr: WATCH_CARE_AR,
    featured: true,
    ageDays: 75,
    salesCount: 88,
    variants: [
      {
        suffix: 'RGB',
        colorFamily: 'ROSE_GOLD',
        colorEn: 'Rose gold / Blush',
        colorAr: 'ذهبي وردي / وردي فاتح',
        hex: '#d8a9a0',
        metal: 'rose',
        accent: '#f4e7e1',
        stock: 9,
      },
      {
        suffix: 'SWH',
        colorFamily: 'SILVER',
        colorEn: 'Silver / White',
        colorAr: 'فضي / أبيض',
        hex: '#2b2a29',
        metal: 'silver',
        accent: '#f6f4ef',
        stock: 6,
      },
    ],
  },
  {
    sku: 'VLR-WCH-MONACO',
    nameEn: 'Monaco Classic Watch',
    nameAr: 'ساعة موناكو كلاسيك',
    category: 'watches',
    brand: 'atlas-horology',
    gender: 'MEN',
    price: 2450,
    cost: 900,
    art: 'watch-leather',
    materialEn: 'Stainless steel case, alligator-embossed leather strap',
    materialAr: 'هيكل من الفولاذ المقاوم للصدأ، سوار جلدي بنقشة التمساح',
    dimensionsMm: [40, 40, 10],
    weightGrams: 72,
    descriptionEn:
      'A dress watch in the grand tradition: 40 mm case, dauphine hands, date window at six o’clock and a domed crystal. Equally at home with a thobe or a tailored suit.',
    descriptionAr:
      'ساعة رسمية على الطراز العريق: هيكل بقطر 40 مم وعقارب دوفين ونافذة للتاريخ عند السادسة وزجاج مقبّب. تليق بالثوب والبدلة على حد سواء.',
    careEn: WATCH_CARE_EN,
    careAr: WATCH_CARE_AR,
    featured: true,
    bestseller: true,
    ageDays: 300,
    salesCount: 212,
    variants: [
      {
        suffix: 'GBK',
        colorFamily: 'GOLD',
        colorEn: 'Gold / Black',
        colorAr: 'ذهبي / أسود',
        hex: '#1b1a19',
        metal: 'gold',
        accent: '#141414',
        stock: 14,
      },
      {
        suffix: 'SNV',
        colorFamily: 'SILVER',
        colorEn: 'Steel / Navy',
        colorAr: 'فولاذي / كحلي',
        hex: '#3b2a1f',
        metal: 'silver',
        accent: '#1d2b45',
        stock: 11,
      },
    ],
  },
  {
    sku: 'VLR-WCH-RIVIERA',
    nameEn: 'Riviera Chronograph',
    nameAr: 'ساعة ريفييرا كرونوغراف',
    category: 'watches',
    brand: 'atlas-horology',
    gender: 'MEN',
    price: 3200,
    compareAt: 3650,
    cost: 1250,
    art: 'watch-chrono',
    materialEn: 'Brushed steel case and bracelet',
    materialAr: 'هيكل وسوار من الفولاذ المصقول',
    dimensionsMm: [42, 42, 12],
    weightGrams: 155,
    descriptionEn:
      'A sporting chronograph with three sub-dials, a tachymeter bezel and a brushed steel bracelet with a butterfly clasp. Built for the drive along the Corniche.',
    descriptionAr:
      'كرونوغراف رياضي بثلاثة موانئ فرعية وإطار تاكيميتر وسوار من الفولاذ المصقول بقفل الفراشة. صُمّمت لقيادة على الكورنيش.',
    careEn: WATCH_CARE_EN,
    careAr: WATCH_CARE_AR,
    ageDays: 210,
    salesCount: 64,
    variants: [
      {
        suffix: 'GRN',
        colorFamily: 'GREEN',
        colorEn: 'Steel / Green',
        colorAr: 'فولاذي / أخضر',
        hex: '#b9bcbf',
        metal: 'silver',
        accent: '#23493a',
        stock: 4,
      },
      {
        suffix: 'BLK',
        colorFamily: 'BLACK',
        colorEn: 'Steel / Black',
        colorAr: 'فولاذي / أسود',
        hex: '#b9bcbf',
        metal: 'silver',
        accent: '#161616',
        stock: 1,
      },
    ],
  },
  {
    sku: 'VLR-WCH-SOLEIL',
    nameEn: 'Soleil Petite Watch',
    nameAr: 'ساعة سوليه الصغيرة',
    category: 'watches',
    brand: 'noor-studio',
    gender: 'WOMEN',
    price: 1390,
    cost: 500,
    art: 'watch-bracelet',
    materialEn: 'Plated stainless steel bracelet, mother-of-pearl dial',
    materialAr: 'سوار من الفولاذ المطلي وميناء من عرق اللؤلؤ',
    dimensionsMm: [26, 26, 7],
    weightGrams: 52,
    descriptionEn:
      'A petite 26 mm watch that wears like fine jewellery. The mother-of-pearl dial shifts from pearl to rose with the light; the fluid bracelet fastens with a hidden clasp.',
    descriptionAr:
      'ساعة صغيرة بقطر 26 مم تُلبس كقطعة مجوهرات راقية. يتدرّج ميناؤها المصنوع من عرق اللؤلؤ بين اللؤلئي والوردي مع الضوء، ويُغلق سوارها الانسيابي بقفل مخفي.',
    careEn: WATCH_CARE_EN,
    careAr: WATCH_CARE_AR,
    newArrival: true,
    ageDays: 18,
    salesCount: 26,
    variants: [
      {
        suffix: 'GLD',
        colorFamily: 'GOLD',
        colorEn: 'Gold',
        colorAr: 'ذهبي',
        hex: '#c8a45e',
        metal: 'gold',
        accent: '#f3ece4',
        stock: 7,
      },
      {
        suffix: 'SLV',
        colorFamily: 'SILVER',
        colorEn: 'Silver',
        colorAr: 'فضي',
        hex: '#c9ccce',
        metal: 'silver',
        accent: '#f3ece4',
        stock: 7,
      },
    ],
  },
  {
    sku: 'VLR-WCH-NAJM',
    nameEn: 'Najm Automatic',
    nameAr: 'ساعة نجم الأوتوماتيكية',
    category: 'watches',
    brand: 'atlas-horology',
    gender: 'MEN',
    price: 4200,
    cost: 1650,
    art: 'watch-leather',
    materialEn: 'Steel case, exhibition caseback, calfskin strap',
    materialAr: 'هيكل فولاذي، ظهر شفاف، سوار من جلد العجل',
    dimensionsMm: [40, 40, 11],
    weightGrams: 80,
    descriptionEn:
      'A self-winding movement visible through the sapphire caseback, 42 hours of power reserve and a cream dial with a subtle star motif at twelve — our tribute to desert night skies.',
    descriptionAr:
      'حركة ذاتية التعبئة تظهر عبر ظهر الساعة الشفاف، واحتياطي طاقة يصل إلى 42 ساعة، وميناء كريمي بنقشة نجمة خفيّة عند الثانية عشرة — تحية لسماء الصحراء ليلاً.',
    careEn: WATCH_CARE_EN,
    careAr: WATCH_CARE_AR,
    featured: true,
    ageDays: 45,
    salesCount: 19,
    variants: [
      {
        suffix: 'BRC',
        colorFamily: 'BROWN',
        colorEn: 'Brown / Cream',
        colorAr: 'بني / كريمي',
        hex: '#5a3a26',
        metal: 'silver',
        accent: '#efe6d3',
        stock: 3,
      },
    ],
  },
  {
    sku: 'VLR-WCH-HORIZON',
    nameEn: 'Horizon Minimal Watch',
    nameAr: 'ساعة هورايزن البسيطة',
    category: 'watches',
    brand: 'noor-studio',
    gender: 'UNISEX',
    price: 990,
    cost: 350,
    art: 'watch-mesh',
    materialEn: 'Steel case, Milanese mesh strap',
    materialAr: 'هيكل فولاذي مع سوار شبكي ميلانيزي',
    dimensionsMm: [38, 38, 7],
    weightGrams: 60,
    descriptionEn:
      'Nothing extra: a clean dial, two slender hands and a Milanese mesh strap that adjusts to any wrist without tools.',
    descriptionAr:
      'بلا أي زوائد: ميناء نظيف وعقربان نحيفان وسوار شبكي ميلانيزي يُضبط على أي معصم دون أدوات.',
    careEn: WATCH_CARE_EN,
    careAr: WATCH_CARE_AR,
    bestseller: true,
    ageDays: 260,
    salesCount: 175,
    variants: [
      {
        suffix: 'BLK',
        colorFamily: 'BLACK',
        colorEn: 'Black',
        colorAr: 'أسود',
        hex: '#232323',
        metal: 'silver',
        accent: '#161616',
        stock: 20,
      },
      {
        suffix: 'SLV',
        colorFamily: 'SILVER',
        colorEn: 'Silver',
        colorAr: 'فضي',
        hex: '#c4c7c9',
        metal: 'silver',
        accent: '#f2f2f0',
        stock: 16,
      },
    ],
  },
  // ---------------------------------------------------------------- Wallets
  {
    sku: 'VLR-WLT-ATLAS',
    nameEn: 'Atlas Leather Wallet',
    nameAr: 'محفظة أطلس الجلدية',
    category: 'wallets',
    brand: 'velora-atelier',
    gender: 'MEN',
    price: 390,
    cost: 130,
    art: 'wallet-bifold',
    materialEn: 'Full-grain leather',
    materialAr: 'جلد طبيعي كامل الحبيبات',
    dimensionsMm: [110, 20, 90],
    weightGrams: 90,
    descriptionEn:
      'A slim bifold with eight card slots, two note compartments and hand-painted edges. Thin enough for a front pocket, strong enough for daily use.',
    descriptionAr:
      'محفظة نحيفة مطوية بثماني فتحات للبطاقات وحجرتين للنقود وحواف مطلية يدوياً. نحيفة بما يكفي لجيبك الأمامي ومتينة للاستخدام اليومي.',
    careEn: LEATHER_CARE_EN,
    careAr: LEATHER_CARE_AR_M,
    bestseller: true,
    ageDays: 330,
    salesCount: 260,
    variants: [
      {
        suffix: 'BLK',
        colorFamily: 'BLACK',
        colorEn: 'Black',
        colorAr: 'أسود',
        hex: '#1d1c1b',
        metal: 'silver',
        stock: 40,
      },
      {
        suffix: 'BRN',
        colorFamily: 'BROWN',
        colorEn: 'Brown',
        colorAr: 'بني',
        hex: '#6a3f24',
        metal: 'gold',
        stock: 25,
      },
    ],
  },
  {
    sku: 'VLR-WLT-RIMA',
    nameEn: 'Rima Card Holder',
    nameAr: 'حافظة بطاقات ريما',
    category: 'wallets',
    brand: 'maison-sahar',
    gender: 'UNISEX',
    price: 240,
    cost: 70,
    art: 'wallet-card',
    materialEn: 'Saffiano leather',
    materialAr: 'جلد سافيانو',
    dimensionsMm: [100, 8, 70],
    weightGrams: 30,
    descriptionEn:
      'Four card slots and a central pocket for folded notes, finished with an embossed V monogram.',
    descriptionAr:
      'أربع فتحات للبطاقات وجيب أوسط للأوراق النقدية المطوية، بلمسة أخيرة من شعار V المنقوش.',
    careEn: LEATHER_CARE_EN,
    careAr: LEATHER_CARE_AR_M,
    ageDays: 140,
    salesCount: 133,
    variants: [
      {
        suffix: 'BLK',
        colorFamily: 'BLACK',
        colorEn: 'Black',
        colorAr: 'أسود',
        hex: '#1a1a1a',
        metal: 'gold',
        stock: 35,
      },
      {
        suffix: 'TAN',
        colorFamily: 'TAN',
        colorEn: 'Tan',
        colorAr: 'بني فاتح',
        hex: '#b27d4e',
        metal: 'gold',
        stock: 22,
      },
      {
        suffix: 'ROS',
        colorFamily: 'PINK',
        colorEn: 'Rose',
        colorAr: 'وردي',
        hex: '#d6a19b',
        metal: 'gold',
        stock: 0,
      },
    ],
  },
  {
    sku: 'VLR-WLT-ZAHRA',
    nameEn: 'Zahra Continental Wallet',
    nameAr: 'محفظة زهرة الطويلة',
    category: 'wallets',
    brand: 'noor-studio',
    gender: 'WOMEN',
    price: 520,
    compareAt: 620,
    cost: 180,
    art: 'wallet-long',
    materialEn: 'Grained leather, zip-around closure',
    materialAr: 'جلد محبّب مع إغلاق بسحاب دائري',
    dimensionsMm: [190, 25, 100],
    weightGrams: 180,
    descriptionEn:
      'A zip-around continental wallet with twelve card slots, a coin pocket and space for your phone — organised enough to replace a small bag.',
    descriptionAr:
      'محفظة طويلة بسحاب دائري تضم اثنتي عشرة فتحة للبطاقات وجيباً للعملات ومساحة لهاتفك، منظّمة بما يكفي لتغنيك عن حقيبة صغيرة.',
    careEn: LEATHER_CARE_EN,
    careAr: LEATHER_CARE_AR,
    ageDays: 190,
    salesCount: 58,
    variants: [
      {
        suffix: 'BLS',
        colorFamily: 'PINK',
        colorEn: 'Blush',
        colorAr: 'وردي فاتح',
        hex: '#e2b7ae',
        metal: 'gold',
        stock: 9,
      },
      {
        suffix: 'BLK',
        colorFamily: 'BLACK',
        colorEn: 'Black',
        colorAr: 'أسود',
        hex: '#1c1b1b',
        metal: 'gold',
        stock: 13,
      },
    ],
  },
  {
    sku: 'VLR-WLT-FARIS',
    nameEn: 'Faris Travel Wallet',
    nameAr: 'محفظة فارس للسفر',
    category: 'wallets',
    brand: 'velora-atelier',
    gender: 'MEN',
    price: 460,
    cost: 160,
    art: 'wallet-travel',
    materialEn: 'Pebbled leather, RFID-blocking lining',
    materialAr: 'جلد محبّب مع بطانة تحجب إشارات RFID',
    dimensionsMm: [210, 20, 120],
    weightGrams: 170,
    descriptionEn:
      'Passport, boarding pass, cards and currency in one place. The RFID-blocking lining protects contactless cards while you travel.',
    descriptionAr:
      'جواز السفر وبطاقة الصعود والبطاقات والعملات في مكان واحد. تحمي البطانة المانعة لإشارات RFID بطاقاتك اللاتلامسية أثناء السفر.',
    careEn: LEATHER_CARE_EN,
    careAr: LEATHER_CARE_AR_M,
    newArrival: true,
    ageDays: 15,
    salesCount: 14,
    variants: [
      {
        suffix: 'NVY',
        colorFamily: 'NAVY',
        colorEn: 'Navy',
        colorAr: 'كحلي',
        hex: '#26344b',
        metal: 'silver',
        stock: 12,
      },
      {
        suffix: 'BRN',
        colorFamily: 'BROWN',
        colorEn: 'Brown',
        colorAr: 'بني',
        hex: '#6d4128',
        metal: 'gold',
        stock: 10,
      },
    ],
  },
  // ---------------------------------------------------------------- Belts
  {
    sku: 'VLR-BLT-NOBLE',
    nameEn: 'Noble Belt',
    nameAr: 'حزام نوبل',
    category: 'belts',
    brand: 'velora-atelier',
    gender: 'MEN',
    price: 450,
    cost: 150,
    art: 'belt-classic',
    materialEn: 'Calf leather, solid brass buckle',
    materialAr: 'جلد عجل مع إبزيم من النحاس المصمت',
    descriptionEn:
      'A 35 mm dress belt with a solid brass V buckle. Cut to your size on request, finished by hand.',
    descriptionAr:
      'حزام رسمي بعرض 35 مم وإبزيم V من النحاس المصمت، يُقص على مقاسك عند الطلب ويُشطّب يدوياً.',
    careEn: LEATHER_CARE_EN,
    careAr: LEATHER_CARE_AR_M,
    ageDays: 280,
    salesCount: 121,
    variants: [
      {
        suffix: 'BLK-95',
        colorFamily: 'BLACK',
        colorEn: 'Black',
        colorAr: 'أسود',
        hex: '#191818',
        metal: 'gold',
        size: '95',
        stock: 10,
      },
      {
        suffix: 'BLK-105',
        colorFamily: 'BLACK',
        colorEn: 'Black',
        colorAr: 'أسود',
        hex: '#191818',
        metal: 'gold',
        size: '105',
        stock: 12,
      },
      {
        suffix: 'BRN-95',
        colorFamily: 'BROWN',
        colorEn: 'Brown',
        colorAr: 'بني',
        hex: '#5d3820',
        metal: 'gold',
        size: '95',
        stock: 6,
      },
      {
        suffix: 'BRN-105',
        colorFamily: 'BROWN',
        colorEn: 'Brown',
        colorAr: 'بني',
        hex: '#5d3820',
        metal: 'gold',
        size: '105',
        stock: 0,
      },
    ],
  },
  {
    sku: 'VLR-BLT-DUO',
    nameEn: 'Duo Reversible Belt',
    nameAr: 'حزام ديو بوجهين',
    category: 'belts',
    brand: 'maison-sahar',
    gender: 'MEN',
    price: 520,
    cost: 175,
    art: 'belt-classic',
    materialEn: 'Reversible leather, rotating buckle',
    materialAr: 'جلد بوجهين مع إبزيم دوّار',
    descriptionEn:
      'Black on one side, brown on the other. A rotating palladium buckle switches colours in seconds — two belts in one.',
    descriptionAr:
      'أسود من جهة وبني من الأخرى، وإبزيم دوّار من البلاديوم يبدّل اللون في ثوانٍ — حزامان في حزام واحد.',
    careEn: LEATHER_CARE_EN,
    careAr: LEATHER_CARE_AR_M,
    bestseller: true,
    ageDays: 230,
    salesCount: 164,
    variants: [
      {
        suffix: 'BB-100',
        colorFamily: 'BLACK',
        colorEn: 'Black / Brown',
        colorAr: 'أسود / بني',
        hex: '#1b1a1a',
        metal: 'silver',
        size: '100',
        stock: 18,
      },
      {
        suffix: 'BB-110',
        colorFamily: 'BLACK',
        colorEn: 'Black / Brown',
        colorAr: 'أسود / بني',
        hex: '#1b1a1a',
        metal: 'silver',
        size: '110',
        stock: 14,
      },
    ],
  },
  {
    sku: 'VLR-BLT-LINA',
    nameEn: 'Lina Slim Belt',
    nameAr: 'حزام لينا الرفيع',
    category: 'belts',
    brand: 'noor-studio',
    gender: 'WOMEN',
    price: 340,
    cost: 110,
    art: 'belt-slim',
    materialEn: 'Smooth leather, gold-tone buckle',
    materialAr: 'جلد ناعم مع إبزيم بلون ذهبي',
    descriptionEn:
      'A 20 mm belt that defines the waist over dresses, abayas and tailored trousers alike.',
    descriptionAr:
      'حزام بعرض 20 مم يُبرز الخصر فوق الفساتين والعبايات والبناطيل المفصّلة على حد سواء.',
    careEn: LEATHER_CARE_EN,
    careAr: LEATHER_CARE_AR,
    newArrival: true,
    ageDays: 20,
    salesCount: 33,
    variants: [
      {
        suffix: 'BLK',
        colorFamily: 'BLACK',
        colorEn: 'Black',
        colorAr: 'أسود',
        hex: '#1b1b1b',
        metal: 'gold',
        size: 'S/M',
        stock: 15,
      },
      {
        suffix: 'CRM',
        colorFamily: 'BEIGE',
        colorEn: 'Cream',
        colorAr: 'كريمي',
        hex: '#e7dcc6',
        metal: 'gold',
        size: 'S/M',
        stock: 9,
      },
      {
        suffix: 'TAN',
        colorFamily: 'TAN',
        colorEn: 'Tan',
        colorAr: 'بني فاتح',
        hex: '#b0784a',
        metal: 'gold',
        size: 'M/L',
        stock: 11,
      },
    ],
  },
  {
    sku: 'VLR-BLT-AURORA',
    nameEn: 'Aurora Chain Belt',
    nameAr: 'حزام أورورا المعدني',
    category: 'belts',
    brand: 'noor-studio',
    gender: 'WOMEN',
    price: 590,
    cost: 210,
    art: 'belt-chain',
    materialEn: 'Gold-plated brass links',
    materialAr: 'حلقات من النحاس المطلي بالذهب',
    descriptionEn:
      'Flat curb links with a V-shaped pendant clasp. Wear it on the waist or double it as a long necklace.',
    descriptionAr: 'حلقات مسطحة مع قفل على شكل V. البسيها على الخصر أو استخدميها كقلادة طويلة.',
    careEn: METAL_CARE_EN,
    careAr: METAL_CARE_AR,
    ageDays: 110,
    salesCount: 29,
    variants: [
      {
        suffix: 'GLD',
        colorFamily: 'GOLD',
        colorEn: 'Gold',
        colorAr: 'ذهبي',
        hex: '#c9a45b',
        metal: 'gold',
        stock: 8,
      },
    ],
  },
  // ---------------------------------------------------------------- Sunglasses
  {
    sku: 'VLR-SUN-LUMIERE',
    nameEn: 'Lumière Sunglasses',
    nameAr: 'نظارة لوميير الشمسية',
    category: 'sunglasses',
    brand: 'riviera-optics',
    gender: 'WOMEN',
    price: 790,
    cost: 260,
    art: 'sunglasses-cateye',
    materialEn: 'Italian acetate, UV400 gradient lenses',
    materialAr: 'إطار أسيتات إيطالي وعدسات متدرّجة بحماية UV400',
    descriptionEn:
      'A softened cat-eye in polished acetate with gradient lenses and our V detail at the temples.',
    descriptionAr:
      'نظارة بتصميم عين القطة المُلطّف من الأسيتات اللامع، بعدسات متدرّجة وتفصيل V على الذراعين.',
    careEn: SUN_CARE_EN,
    careAr: SUN_CARE_AR,
    featured: true,
    ageDays: 65,
    salesCount: 92,
    variants: [
      {
        suffix: 'BLK',
        colorFamily: 'BLACK',
        colorEn: 'Black',
        colorAr: 'أسود',
        hex: '#141414',
        metal: 'gold',
        accent: '#3d3a36',
        stock: 14,
      },
      {
        suffix: 'TRT',
        colorFamily: 'BROWN',
        colorEn: 'Tortoise',
        colorAr: 'صدفي',
        hex: '#6b3f1e',
        metal: 'gold',
        accent: '#5b4631',
        stock: 9,
      },
    ],
  },
  {
    sku: 'VLR-SUN-FALCON',
    nameEn: 'Falcon Aviator',
    nameAr: 'نظارة فالكون أفياتور',
    category: 'sunglasses',
    brand: 'riviera-optics',
    gender: 'MEN',
    price: 850,
    cost: 290,
    art: 'sunglasses-aviator',
    materialEn: 'Titanium frame, polarised lenses',
    materialAr: 'إطار من التيتانيوم وعدسات مستقطبة',
    descriptionEn:
      'A lightweight titanium aviator with polarised lenses that cut glare on bright desert days.',
    descriptionAr:
      'نظارة أفياتور خفيفة من التيتانيوم بعدسات مستقطبة تحدّ من الوهج في أيام الصحراء المشمسة.',
    careEn: SUN_CARE_EN,
    careAr: SUN_CARE_AR,
    bestseller: true,
    ageDays: 310,
    salesCount: 198,
    variants: [
      {
        suffix: 'GGR',
        colorFamily: 'GOLD',
        colorEn: 'Gold / Green',
        colorAr: 'ذهبي / أخضر',
        hex: '#c6a35d',
        metal: 'gold',
        accent: '#3f4e3a',
        stock: 16,
      },
      {
        suffix: 'SGY',
        colorFamily: 'SILVER',
        colorEn: 'Silver / Grey',
        colorAr: 'فضي / رمادي',
        hex: '#c3c6c8',
        metal: 'silver',
        accent: '#4a4d52',
        stock: 12,
      },
    ],
  },
  {
    sku: 'VLR-SUN-MARINA',
    nameEn: 'Marina Round Sunglasses',
    nameAr: 'نظارة مارينا الدائرية',
    category: 'sunglasses',
    brand: 'riviera-optics',
    gender: 'UNISEX',
    price: 690,
    compareAt: 820,
    cost: 230,
    art: 'sunglasses-round',
    materialEn: 'Acetate and metal, UV400 lenses',
    materialAr: 'أسيتات ومعدن مع عدسات بحماية UV400',
    descriptionEn:
      'Round lenses with a keyhole bridge — a vintage-inspired shape that flatters most face types.',
    descriptionAr:
      'عدسات دائرية مع جسر على شكل ثقب المفتاح، تصميم مستوحى من الطراز الكلاسيكي يناسب معظم أشكال الوجوه.',
    careEn: SUN_CARE_EN,
    careAr: SUN_CARE_AR,
    ageDays: 220,
    salesCount: 67,
    variants: [
      {
        suffix: 'TRT',
        colorFamily: 'BROWN',
        colorEn: 'Tortoise',
        colorAr: 'صدفي',
        hex: '#70431f',
        metal: 'gold',
        accent: '#6b5238',
        stock: 7,
      },
      {
        suffix: 'BLK',
        colorFamily: 'BLACK',
        colorEn: 'Black',
        colorAr: 'أسود',
        hex: '#151515',
        metal: 'silver',
        accent: '#3a3a3a',
        stock: 5,
      },
    ],
  },
  {
    sku: 'VLR-SUN-SAHARA',
    nameEn: 'Sahara Square Sunglasses',
    nameAr: 'نظارة صحارى المربعة',
    category: 'sunglasses',
    brand: 'riviera-optics',
    gender: 'MEN',
    price: 740,
    cost: 250,
    art: 'sunglasses-square',
    materialEn: 'Thick-cut acetate, polarised lenses',
    materialAr: 'أسيتات سميك وعدسات مستقطبة',
    descriptionEn:
      'A bold square frame with sculpted temples and polarised lenses. Confident without being loud.',
    descriptionAr: 'إطار مربع جريء بأذرع منحوتة وعدسات مستقطبة. حضور واثق دون مبالغة.',
    careEn: SUN_CARE_EN,
    careAr: SUN_CARE_AR,
    newArrival: true,
    ageDays: 10,
    salesCount: 17,
    variants: [
      {
        suffix: 'BLK',
        colorFamily: 'BLACK',
        colorEn: 'Black',
        colorAr: 'أسود',
        hex: '#131313',
        metal: 'silver',
        accent: '#2f3033',
        stock: 13,
      },
      {
        suffix: 'BRN',
        colorFamily: 'BROWN',
        colorEn: 'Brown',
        colorAr: 'بني',
        hex: '#5a3521',
        metal: 'gold',
        accent: '#5a4a39',
        stock: 8,
      },
    ],
  },
  // ---------------------------------------------------------------- Jewellery & small accessories
  {
    sku: 'VLR-JWL-HILAL',
    nameEn: 'Hilal Bangle',
    nameAr: 'سوار هلال',
    category: 'jewellery',
    brand: 'noor-studio',
    gender: 'WOMEN',
    price: 480,
    cost: 150,
    art: 'bangle',
    materialEn: '18k gold-plated brass',
    materialAr: 'نحاس مطلي بالذهب عيار 18',
    descriptionEn:
      'An open bangle whose ends meet like a crescent moon. Stack it or wear it alone with a watch.',
    descriptionAr:
      'سوار مفتوح يلتقي طرفاه كالهلال. نسّقيه مع أساور أخرى أو ارتديه وحده بجانب ساعتك.',
    careEn: METAL_CARE_EN,
    careAr: METAL_CARE_AR,
    featured: true,
    ageDays: 100,
    salesCount: 84,
    variants: [
      {
        suffix: 'GLD',
        colorFamily: 'GOLD',
        colorEn: 'Gold',
        colorAr: 'ذهبي',
        hex: '#c9a45b',
        metal: 'gold',
        stock: 20,
      },
      {
        suffix: 'SLV',
        colorFamily: 'SILVER',
        colorEn: 'Silver',
        colorAr: 'فضي',
        hex: '#c6c9cb',
        metal: 'silver',
        stock: 14,
      },
    ],
  },
  {
    sku: 'VLR-JWL-SULTAN',
    nameEn: 'Sultan Cufflinks',
    nameAr: 'أزرار أكمام سلطان',
    category: 'jewellery',
    brand: 'velora-atelier',
    gender: 'MEN',
    price: 390,
    cost: 120,
    art: 'cufflinks',
    materialEn: 'Plated sterling silver, onyx inlay',
    materialAr: 'فضة إسترلينية مطلية مع تطعيم بحجر الأونيكس',
    descriptionEn: 'Square cufflinks with a polished onyx inlay, presented in a VÉLORA gift box.',
    descriptionAr:
      'أزرار أكمام مربعة مطعّمة بحجر الأونيكس المصقول، تُقدّم في علبة هدايا من فيلورا.',
    careEn: METAL_CARE_EN,
    careAr: METAL_CARE_AR,
    ageDays: 160,
    salesCount: 47,
    variants: [
      {
        suffix: 'GON',
        colorFamily: 'GOLD',
        colorEn: 'Gold / Onyx',
        colorAr: 'ذهبي / أونيكس',
        hex: '#c7a45f',
        metal: 'gold',
        accent: '#141414',
        stock: 11,
      },
      {
        suffix: 'SON',
        colorFamily: 'SILVER',
        colorEn: 'Silver / Onyx',
        colorAr: 'فضي / أونيكس',
        hex: '#c5c8ca',
        metal: 'silver',
        accent: '#141414',
        stock: 9,
      },
    ],
  },
  {
    sku: 'VLR-JWL-YASMIN',
    nameEn: 'Yasmin Silk Scarf',
    nameAr: 'وشاح ياسمين الحريري',
    category: 'jewellery',
    brand: 'maison-sahar',
    gender: 'WOMEN',
    price: 420,
    cost: 140,
    art: 'scarf',
    materialEn: '100% mulberry silk twill',
    materialAr: 'حرير توت طبيعي 100%',
    dimensionsMm: [900, 1, 900],
    weightGrams: 70,
    descriptionEn:
      'A 90 cm square in silk twill, printed with a jasmine pattern and hand-rolled edges. Tie it at the neck, on a bag handle or as a hair accessory.',
    descriptionAr:
      'وشاح مربع بمقاس 90 سم من حرير التويل، بنقشة الياسمين وحواف ملفوفة يدوياً. اربطيه حول العنق أو على مقبض الحقيبة أو كإكسسوار للشعر.',
    careEn: 'Dry clean only. Iron on a low silk setting.',
    careAr: 'تنظيف جاف فقط، ويُكوى على درجة حرارة منخفضة مخصصة للحرير.',
    newArrival: true,
    ageDays: 25,
    salesCount: 21,
    variants: [
      {
        suffix: 'BLS',
        colorFamily: 'PINK',
        colorEn: 'Blush jasmine',
        colorAr: 'ياسمين وردي',
        hex: '#e8c5bd',
        metal: 'gold',
        accent: '#b98b5f',
        stock: 12,
      },
      {
        suffix: 'NVY',
        colorFamily: 'NAVY',
        colorEn: 'Navy jasmine',
        colorAr: 'ياسمين كحلي',
        hex: '#26324a',
        metal: 'gold',
        accent: '#d9c49a',
        stock: 10,
      },
    ],
  },
  {
    sku: 'VLR-JWL-CHARM',
    nameEn: 'VÉLORA Bag Charm',
    nameAr: 'تعليقة فيلورا للحقائب',
    category: 'jewellery',
    brand: 'velora-atelier',
    gender: 'UNISEX',
    price: 190,
    cost: 55,
    art: 'charm',
    materialEn: 'Gold-tone metal, leather tassel',
    materialAr: 'معدن بلون ذهبي مع شرابة جلدية',
    descriptionEn: 'Our V monogram on a leather tassel — a small signature for your bag or keys.',
    descriptionAr: 'شعار V على شرابة جلدية، توقيع صغير لحقيبتك أو مفاتيحك.',
    careEn: METAL_CARE_EN,
    careAr: METAL_CARE_AR,
    ageDays: 130,
    salesCount: 102,
    variants: [
      {
        suffix: 'BLK',
        colorFamily: 'BLACK',
        colorEn: 'Black tassel',
        colorAr: 'شرابة سوداء',
        hex: '#1b1a1a',
        metal: 'gold',
        stock: 30,
      },
      {
        suffix: 'COG',
        colorFamily: 'BROWN',
        colorEn: 'Cognac tassel',
        colorAr: 'شرابة كونياك',
        hex: '#8a4f2a',
        metal: 'gold',
        stock: 25,
      },
    ],
  },
]

// ---------------------------------------------------------------- Image paths
// Shared by the seed and scripts/assets/generate-images.ts so they never diverge.

/** Variants that differ only by size share one colour image (e.g. BLK-95 / BLK-105 → "blk"). */
export function colorKey(variant: SeedVariant): string {
  return variant.suffix.split('-')[0]!.toLowerCase()
}

export function productImageDir(product: SeedProduct): string {
  return `/images/products/${product.sku.toLowerCase()}`
}

export function variantImagePath(product: SeedProduct, variant: SeedVariant): string {
  return `${productImageDir(product)}/${colorKey(variant)}.webp`
}

export function detailImagePath(product: SeedProduct): string {
  return `${productImageDir(product)}/detail.webp`
}

export const PRODUCT_IMAGE_SIZE = { width: 1200, height: 1500 } as const
