import 'server-only'
import { cache } from 'react'
import { prisma } from '@/db/client'
import type { Locale } from '@/i18n/config'
import { formatMoney } from '@/i18n/format'
import { type PageToken, renderPageTokens } from '@/lib/content/page-tokens'
import { getSettings } from '@/services/settings/settings.service'

/** Current values for the page {{tokens}}, formatted for one locale. */
export async function getPageTokenValues(locale: Locale): Promise<Record<PageToken, string>> {
  const [shipping, cod, returns] = await Promise.all([
    getSettings('shipping'),
    getSettings('cod'),
    getSettings('returns'),
  ])
  const money = (amount: number) => formatMoney(amount, locale, { hideZeroFraction: true })
  const range = (min: number, max: number) => (min === max ? String(min) : `${min}–${max}`)
  return {
    standardFee: money(shipping.standardFee),
    expressFee: money(shipping.expressFee),
    freeShippingThreshold:
      shipping.freeShippingThreshold === null ? '—' : money(shipping.freeShippingThreshold),
    codFee: money(cod.fee),
    returnWindowDays: String(returns.windowDays),
    standardDays: range(shipping.standardDaysMin, shipping.standardDaysMax),
    expressDays: range(shipping.expressDaysMin, shipping.expressDaysMax),
  }
}

export interface PageView {
  slug: string
  title: string
  content: string
  seoTitle: string | null
  seoDescription: string | null
  updatedAt: Date
}

export const getPublishedPage = cache(
  async (slug: string, locale: Locale): Promise<PageView | null> => {
    const page = await prisma.page.findFirst({ where: { slug, isPublished: true } })
    if (!page) return null
    const ar = locale === 'ar'
    return {
      slug: page.slug,
      title: ar ? page.titleAr : page.titleEn,
      content: renderPageTokens(
        ar ? page.contentAr : page.contentEn,
        await getPageTokenValues(locale),
      ),
      seoTitle: ar ? page.seoTitleAr : page.seoTitleEn,
      seoDescription: ar ? page.seoDescriptionAr : page.seoDescriptionEn,
      updatedAt: page.updatedAt,
    }
  },
)

export async function getPublishedFaq(locale: Locale) {
  const [rows, values] = await Promise.all([
    prisma.faqItem.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, questionAr: true, questionEn: true, answerAr: true, answerEn: true },
    }),
    getPageTokenValues(locale),
  ])
  return rows.map((row) => ({
    id: row.id,
    question: locale === 'ar' ? row.questionAr : row.questionEn,
    answer: renderPageTokens(locale === 'ar' ? row.answerAr : row.answerEn, values),
  }))
}
