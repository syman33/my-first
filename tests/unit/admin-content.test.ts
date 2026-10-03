import { describe, expect, it } from 'vitest'
import { bannerSchema, couponSchema, faqSchema, pageSchema } from '@/schemas/admin-content'
import { PAGE_TOKENS, renderPageTokens } from '@/lib/content/page-tokens'

const coupon = {
  code: ' summer-25 ',
  descriptionAr: '',
  descriptionEn: '  ',
  type: 'PERCENTAGE',
  value: 2_500,
  minOrderAmount: null,
  maxDiscountAmount: 10_000,
  startsAt: '2026-06-01T00:00',
  expiresAt: '',
  usageLimit: null,
  usageLimitPerUser: 1,
  scope: 'ALL',
  isActive: true,
}

const banner = {
  placement: 'HERO',
  titleAr: 'مجموعة الخريف',
  titleEn: 'The autumn edit',
  linkUrl: '/new-arrivals',
  imageUrl: '/uploads/banners/abc.webp',
  mobileImageUrl: '',
  startsAt: '',
  endsAt: '',
  isActive: true,
  sortOrder: 0,
}

function issues(result: {
  success: boolean
  error?: { issues: { path: PropertyKey[]; message: string }[] }
}) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]),
  )
}

describe('couponSchema', () => {
  it('normalises the code, blanks and store-time dates', () => {
    const parsed = couponSchema.parse(coupon)
    expect(parsed).toMatchObject({
      code: 'SUMMER-25',
      descriptionAr: null,
      descriptionEn: null,
      startsAt: new Date('2026-05-31T21:00:00.000Z'),
      expiresAt: null,
      productSkus: [],
      categoryIds: [],
    })
  })

  it('caps percentages at 100% and keeps the window in order', () => {
    expect(issues(couponSchema.safeParse({ ...coupon, value: 10_001 }))).toEqual({
      value: 'amount',
    })
    expect(
      issues(
        couponSchema.safeParse({
          ...coupon,
          startsAt: '2026-06-02T10:00',
          expiresAt: '2026-06-02T10:00',
        }),
      ),
    ).toEqual({ expiresAt: 'dateOrder' })
    // Fixed amounts are halalas and may exceed 10,000.
    expect(couponSchema.safeParse({ ...coupon, type: 'FIXED_AMOUNT', value: 50_000 }).success).toBe(
      true,
    )
  })

  it('requires the products or categories a scoped coupon applies to', () => {
    expect(issues(couponSchema.safeParse({ ...coupon, scope: 'PRODUCTS' }))).toEqual({
      productSkus: 'required',
    })
    expect(issues(couponSchema.safeParse({ ...coupon, scope: 'CATEGORIES' }))).toEqual({
      categoryIds: 'required',
    })
    expect(
      couponSchema.parse({ ...coupon, scope: 'PRODUCTS', productSkus: [' vl-bag-001 '] })
        .productSkus,
    ).toEqual(['VL-BAG-001'])
  })

  it('rejects codes customers could not type reliably', () => {
    for (const code of ['AB', 'SUMMER 25', 'ÉTÉ25', 'X'.repeat(41), 'drop;table']) {
      expect(issues(couponSchema.safeParse({ ...coupon, code })), code).toEqual({
        code: 'couponCode',
      })
    }
  })

  it('rejects an impossible calendar date instead of rolling it over', () => {
    expect(issues(couponSchema.safeParse({ ...coupon, startsAt: '2026-02-30T10:00' }))).toEqual({
      startsAt: 'date',
    })
  })
})

describe('bannerSchema', () => {
  it('accepts same-site paths and https URLs only', () => {
    expect(bannerSchema.parse(banner)).toMatchObject({
      mobileImageUrl: null,
      startsAt: null,
      linkUrl: '/new-arrivals',
    })
    expect(bannerSchema.parse({ ...banner, linkUrl: 'https://velora.sa/journal' }).linkUrl).toBe(
      'https://velora.sa/journal',
    )
    expect(bannerSchema.parse({ ...banner, linkUrl: '' }).linkUrl).toBeNull()
    for (const linkUrl of [
      'javascript:alert(1)',
      '//evil.example/x',
      'http://velora.sa',
      'data:text/html,hi',
      '/a b',
    ]) {
      expect(issues(bannerSchema.safeParse({ ...banner, linkUrl })), linkUrl).toEqual({
        linkUrl: 'url',
      })
    }
    expect(issues(bannerSchema.safeParse({ ...banner, imageUrl: '' }))).toEqual({ imageUrl: 'url' })
  })

  it('keeps the schedule in order', () => {
    expect(
      issues(
        bannerSchema.safeParse({
          ...banner,
          startsAt: '2026-10-10T10:00',
          endsAt: '2026-10-01T10:00',
        }),
      ),
    ).toEqual({ endsAt: 'dateOrder' })
  })
})

describe('pages and FAQ', () => {
  it('requires both languages and blanks optional SEO fields', () => {
    const page = pageSchema.parse({
      titleAr: 'الشحن',
      titleEn: 'Shipping',
      contentAr: 'نص',
      contentEn: 'Text',
      seoTitleAr: '  ',
      isPublished: true,
    })
    expect(page).toMatchObject({ seoTitleAr: null, seoTitleEn: null, seoDescriptionEn: null })
    expect(
      issues(
        pageSchema.safeParse({
          titleAr: 'الشحن',
          titleEn: 'S',
          contentAr: ' ',
          contentEn: 'x',
          isPublished: true,
        }),
      ),
    ).toEqual({ titleEn: 'tooShort', contentAr: 'required' })
    expect(
      issues(
        faqSchema.safeParse({
          questionAr: 'سؤال؟',
          questionEn: 'Q?',
          answerAr: 'جواب',
          answerEn: 'Answer',
          sortOrder: 1001,
          isPublished: true,
        }),
      ),
    ).toMatchObject({ questionEn: 'tooShort' })
  })

  it('renders every documented token and leaves unknown ones visible', () => {
    const values = Object.fromEntries(PAGE_TOKENS.map((token) => [token, `<${token}>`])) as Record<
      (typeof PAGE_TOKENS)[number],
      string
    >
    const source = PAGE_TOKENS.map((token) => `{{ ${token} }}`).join(' ')
    expect(renderPageTokens(source, values)).toBe(
      PAGE_TOKENS.map((token) => `<${token}>`).join(' '),
    )
    expect(renderPageTokens('{{constructor}} {{__proto__}}', values)).toBe(
      '{{constructor}} {{__proto__}}',
    )
  })
})
