import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/catalog/breadcrumbs'
import { Markdown } from '@/components/content/markdown'
import { getDictionary, interpolate } from '@/i18n'
import { isLocale } from '@/i18n/config'
import { formatDate } from '@/i18n/format'
import { metaDescription, openGraph, samePathAlternates } from '@/lib/seo'
import { getPublishedPage } from '@/services/content/page.service'
import { inlineText, parseMarkdown } from '@/utils/markdown'

/**
 * Shared implementation for the editable policy pages (about, shipping,
 * returns, privacy, terms). Content lives in the database (admin CMS);
 * a missing or unpublished page is a 404.
 */
export async function cmsMetadata(rawLocale: string, slug: string): Promise<Metadata> {
  if (!isLocale(rawLocale)) return {}
  const page = await getPublishedPage(slug, rawLocale)
  if (!page) return {}
  const firstParagraph = parseMarkdown(page.content).find((block) => block.type === 'paragraph')
  const description =
    page.seoDescription ??
    metaDescription(
      firstParagraph?.type === 'paragraph' ? inlineText(firstParagraph.children) : page.title,
    )
  return {
    title: page.seoTitle ?? page.title,
    description,
    alternates: samePathAlternates(rawLocale, `/${slug}`),
    openGraph: openGraph(rawLocale, {
      title: page.title,
      description,
      url: `/${rawLocale}/${slug}`,
    }),
  }
}

export async function CmsPage({ locale: rawLocale, slug }: { locale: string; slug: string }) {
  if (!isLocale(rawLocale)) notFound()
  const locale = rawLocale
  const page = await getPublishedPage(slug, locale)
  if (!page) notFound()
  const dict = getDictionary(locale)
  return (
    <article className="container-luxe py-10 lg:py-16">
      <Breadcrumbs
        locale={locale}
        label={dict.store.product.breadcrumb}
        items={[
          { name: dict.common.home, href: `/${locale}` },
          { name: page.title, href: `/${locale}/${slug}` },
        ]}
      />
      <header className="mt-8 max-w-3xl">
        <h1 className="font-display text-4xl text-ink md:text-5xl">{page.title}</h1>
        <p className="mt-3 text-xs text-muted">
          {interpolate(dict.store.contentUpdated, { date: formatDate(page.updatedAt, locale) })}
        </p>
      </header>
      <Markdown source={page.content} className="prose-velora mt-10" />
    </article>
  )
}
