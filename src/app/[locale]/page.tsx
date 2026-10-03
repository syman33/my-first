import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/seo/json-ld'
import { BrandStory } from '@/components/home/brand-story'
import { CategoryTiles } from '@/components/home/category-tiles'
import { CollectionSplit } from '@/components/home/collection-split'
import { Hero } from '@/components/home/hero'
import { Lookbook } from '@/components/home/lookbook'
import { NewsletterForm } from '@/components/home/newsletter-form'
import { ProductRailSection } from '@/components/home/product-rail'
import { PromoBanners } from '@/components/home/promo-banners'
import { getDictionary } from '@/i18n'
import { isLocale, type Locale, pickLocalized } from '@/i18n/config'
import { absoluteUrl, openGraph, samePathAlternates, siteOrigin } from '@/lib/seo'
import { descendantIds, getActiveCategories } from '@/services/catalog/category.service'
import { productRail } from '@/services/catalog/listing.service'
import { getActiveBanners } from '@/services/content/banner.service'
import { getSettings } from '@/services/settings/settings.service'

export async function generateMetadata({ params }: PageProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const [dict, seo] = [getDictionary(locale), await getSettings('seo')]
  const title = (locale === 'ar' ? seo.titleAr : seo.titleEn) ?? dict.meta.defaultTitle
  const description =
    (locale === 'ar' ? seo.descriptionAr : seo.descriptionEn) ?? dict.meta.defaultDescription
  return {
    title: { absolute: title },
    description,
    alternates: samePathAlternates(locale, '/'),
    openGraph: openGraph(locale, { title, description, url: `/${locale}` }),
    twitter: { card: 'summary_large_image', title, description },
  }
}

async function categoryRail(locale: Locale, slug: string) {
  const categories = await getActiveCategories()
  const category = categories.find((c) => c.slug === slug)
  if (!category) return { category: null, products: [] }
  const products = await productRail(
    { kind: 'category', categoryIds: descendantIds(categories, category.id) },
    'featured',
    locale,
    { take: 4 },
  )
  return { category, products }
}

export default async function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const dict = getDictionary(locale)
  const t = dict.store.home

  const [
    heroBanners,
    promoBanners,
    categories,
    newArrivals,
    bestSellers,
    bags,
    watches,
    accessories,
    store,
  ] = await Promise.all([
    getActiveBanners('HERO', locale),
    getActiveBanners('PROMO', locale),
    getActiveCategories(),
    productRail({ kind: 'new-arrivals' }, 'newest', locale, { take: 4 }),
    productRail({ kind: 'best-sellers' }, 'best-selling', locale, { take: 4 }),
    categoryRail(locale, 'bags'),
    categoryRail(locale, 'watches'),
    categoryRail(locale, 'accessories'),
    getSettings('store'),
  ])

  const hero = heroBanners[0]
  const topLevel = categories.filter(
    (c) => c.parentId === null && (c.kind === 'STANDARD' || c.kind === 'GENDER'),
  )
  const genders = categories.filter((c) => c.kind === 'GENDER')
  const collectionLink = (slug: string) => `/${locale}/${slug}`
  const social = Object.values(store.social).filter((url): url is string => Boolean(url))

  return (
    <>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'VÉLORA',
            alternateName: 'فيلورا',
            url: siteOrigin(),
            logo: absoluteUrl('/brand/velora-monogram-black.svg'),
            email: store.email,
            telephone: store.phone,
            contactPoint: [
              {
                '@type': 'ContactPoint',
                contactType: 'customer service',
                email: store.email,
                telephone: store.phone,
                areaServed: 'SA',
                availableLanguage: ['ar', 'en'],
              },
            ],
            ...(social.length > 0 ? { sameAs: social } : {}),
          },
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'VÉLORA',
            url: absoluteUrl(`/${locale}`),
            inLanguage: locale,
            potentialAction: {
              '@type': 'SearchAction',
              target: {
                '@type': 'EntryPoint',
                urlTemplate: absoluteUrl(`/${locale}/search?q={search_term_string}`),
              },
              'query-input': 'required name=search_term_string',
            },
          },
        ]}
      />

      <Hero
        eyebrow={t.heroEyebrow}
        title={hero?.title ?? t.heroTitle}
        text={hero ? hero.subtitle : t.heroText}
        primary={{ label: hero?.ctaLabel ?? t.shopNow, href: hero?.href ?? `/${locale}/shop` }}
        secondary={{ label: t.discover, href: `/${locale}/new-arrivals` }}
        image={{
          desktop: hero?.imageUrl ?? '/images/editorial/hero-desktop.webp',
          mobile: hero ? hero.mobileImageUrl : '/images/editorial/hero-mobile.webp',
          alt: hero?.alt ?? '',
        }}
      />

      <CategoryTiles
        locale={locale}
        title={t.categoriesTitle}
        tiles={topLevel.map((c) => ({
          slug: c.slug,
          name: pickLocalized(c, 'name', locale),
          imageUrl: c.imageUrl,
        }))}
      />

      <ProductRailSection
        id="home-new"
        locale={locale}
        title={t.newArrivals}
        products={newArrivals}
        viewAll={{ href: `/${locale}/new-arrivals`, label: t.viewAll }}
        cardT={dict.store.card}
      />

      <CollectionSplit
        label={`${t.women} / ${t.men}`}
        tiles={genders.map((c) => ({
          href: collectionLink(c.slug),
          title: c.gender === 'MEN' ? t.men : t.women,
          description: pickLocalized(c, 'description', locale) || null,
          cta: t.shopNow,
          imageUrl: c.imageUrl,
        }))}
      />

      <ProductRailSection
        id="home-best"
        locale={locale}
        title={t.bestSellers}
        products={bestSellers}
        viewAll={{ href: `/${locale}/best-sellers`, label: t.viewAll }}
        cardT={dict.store.card}
      />

      <PromoBanners label={dict.nav.offers} banners={promoBanners} />

      {[
        { id: 'home-bags', title: t.bags, rail: bags },
        { id: 'home-watches', title: t.watches, rail: watches },
        { id: 'home-accessories', title: t.accessories, rail: accessories },
      ].map(({ id, title, rail }) =>
        rail.category ? (
          <ProductRailSection
            key={id}
            id={id}
            locale={locale}
            title={title}
            products={rail.products}
            viewAll={{ href: collectionLink(rail.category.slug), label: t.viewAll }}
            cardT={dict.store.card}
          />
        ) : null,
      )}

      <BrandStory
        eyebrow={t.storyEyebrow}
        title={t.storyTitle}
        text={t.storyText}
        cta={{ href: `/${locale}/about`, label: t.storyCta }}
      />

      <Lookbook title={t.galleryTitle} text={t.galleryText} altTemplate={t.galleryAlt} />

      <section aria-labelledby="newsletter-title" className="bg-sand py-16 lg:py-24">
        <div className="container-luxe flex flex-col items-center text-center">
          <h2 id="newsletter-title" className="font-display text-3xl text-ink md:text-4xl">
            {dict.store.newsletter.title}
          </h2>
          <p className="mt-3 max-w-lg text-muted">{dict.store.newsletter.text}</p>
          <div className="mt-8 w-full max-w-md">
            <NewsletterForm
              locale={locale}
              t={dict.store.newsletter}
              fieldMessages={dict.errors.fields}
              genericError={dict.errors.generic}
              source="home"
            />
          </div>
        </div>
      </section>
    </>
  )
}
