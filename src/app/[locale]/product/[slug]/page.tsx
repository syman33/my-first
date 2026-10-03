import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/catalog/breadcrumbs'
import { ProductGrid } from '@/components/catalog/product-grid'
import { ProductReviews } from '@/components/catalog/product-reviews'
import { ReviewForm } from '@/components/catalog/review-form'
import { type ShowcaseVariant } from '@/components/catalog/product-showcase'
import { ProductPurchase } from '@/components/cart/product-purchase'
import { RatingStars } from '@/components/catalog/rating-stars'
import { JsonLd } from '@/components/seo/json-ld'
import { getDictionary, interpolate, plural } from '@/i18n'
import { isLocale, type Locale } from '@/i18n/config'
import { formatMoney } from '@/i18n/format'
import { getCurrentSession, loginPath } from '@/lib/auth/current-user'
import { absoluteUrl, localizedAlternates, metaDescription, openGraph } from '@/lib/seo'
import { productRail } from '@/services/catalog/listing.service'
import {
  getApprovedReviews,
  getProductPage,
  type ProductDetail,
} from '@/services/catalog/product.service'
import { reviewEligibility } from '@/services/reviews/review.service'
import { getSettings } from '@/services/settings/settings.service'
import { getWishlistProductIds } from '@/services/wishlist/wishlist.service'
import { halalasToSarString } from '@/utils/money'

function productPath(locale: Locale, product: Pick<ProductDetail, 'slugAr' | 'slugEn'>): string {
  return `/${locale}/product/${encodeURIComponent(locale === 'ar' ? product.slugAr : product.slugEn)}`
}

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/product/[slug]'>): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) return {}
  const lookup = await getProductPage(slug, locale)
  if (lookup.status !== 'ok') return {}
  const { product } = lookup
  const title = product.seoTitle ?? product.name
  const description = product.seoDescription ?? metaDescription(product.description)
  const image = product.images[0]
  return {
    title,
    description,
    alternates: localizedAlternates(locale, {
      ar: productPath('ar', product),
      en: productPath('en', product),
    }),
    openGraph: openGraph(locale, {
      title,
      description,
      url: productPath(locale, product),
      images: image ? [{ url: image.url, alt: image.alt }] : undefined,
    }),
    twitter: { card: 'summary_large_image', title, description },
  }
}

function productJsonLd(locale: Locale, product: ProductDetail) {
  const prices = product.variants.map((v) => v.price)
  const inStock = product.variants.some((v) => v.stock !== 'out_of_stock')
  const url = absoluteUrl(productPath(locale, product))
  const availability = inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
  const low = Math.min(...prices)
  const high = Math.max(...prices)
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: metaDescription(product.description, 500),
    sku: product.sku,
    image: product.images.map((image) => absoluteUrl(image.url)),
    url,
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand.name } } : {}),
    ...(product.material ? { material: product.material } : {}),
    offers:
      prices.length > 1 && low !== high
        ? {
            '@type': 'AggregateOffer',
            priceCurrency: 'SAR',
            lowPrice: halalasToSarString(low),
            highPrice: halalasToSarString(high),
            offerCount: prices.length,
            availability,
            url,
          }
        : {
            '@type': 'Offer',
            priceCurrency: 'SAR',
            price: halalasToSarString(prices[0] ?? 0),
            availability,
            url,
            itemCondition: 'https://schema.org/NewCondition',
          },
    ...(product.rating
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.rating.average.toFixed(1),
            reviewCount: product.rating.count,
          },
        }
      : {}),
  }
}

export default async function ProductPage({
  params,
  searchParams,
}: PageProps<'/[locale]/product/[slug]'>) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  const lookup = await getProductPage(slug, locale)
  if (lookup.status === 'not_found') notFound()
  if (lookup.status === 'redirect')
    permanentRedirect(`/${locale}/product/${encodeURIComponent(lookup.slug)}`)
  const { product } = lookup

  const dict = getDictionary(locale)
  const t = dict.store.product
  const rawPage = (await searchParams).reviews
  const reviewsPage = Math.max(
    1,
    Math.min(Number.parseInt(typeof rawPage === 'string' ? rawPage : '1', 10) || 1, 100),
  )

  const session = await getCurrentSession()
  const [reviews, related, shipping, returns, wishlistIds, eligibility] = await Promise.all([
    getApprovedReviews(product.id, reviewsPage),
    productRail({ kind: 'category', categoryIds: [product.categoryId] }, 'best-selling', locale, {
      take: 4,
      excludeId: product.id,
    }),
    getSettings('shipping'),
    getSettings('returns'),
    getWishlistProductIds(),
    reviewEligibility(session?.user.id ?? null, product.id),
  ])

  const variants: ShowcaseVariant[] = product.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    colorKey: variant.colorHex ?? variant.colorName,
    colorName: variant.colorName,
    colorHex: variant.colorHex,
    size: variant.size,
    price: variant.price,
    compareAtPrice: variant.compareAtPrice,
    stock: variant.stock,
    lowStockCount: variant.lowStockCount,
    imageId: variant.imageId,
  }))

  const crumbs = [
    { name: dict.common.home, href: `/${locale}` },
    ...product.breadcrumbs.map((crumb) => ({
      name: crumb.name,
      href: `/${locale}/${encodeURIComponent(crumb.slug)}`,
    })),
    { name: product.name, href: productPath(locale, product) },
  ]
  const dims = product.dimensionsMm
  const cm = (mm: number | null) => (mm === null ? '—' : String(Math.round(mm / 10)))
  const shippingDays =
    shipping.standardDaysMin === shipping.standardDaysMax
      ? String(shipping.standardDaysMin)
      : `${shipping.standardDaysMin}–${shipping.standardDaysMax}`

  return (
    <div className="container-luxe py-8 lg:py-12">
      <JsonLd data={productJsonLd(locale, product)} />
      <Breadcrumbs locale={locale} label={t.breadcrumb} items={crumbs} />

      <div className="mt-8">
        <ProductPurchase
          productId={product.id}
          productName={product.name}
          inWishlist={wishlistIds.has(product.id)}
          addToBagT={dict.cart.addToBag}
          wishlistT={dict.cart.wishlist}
          genericError={dict.errors.generic}
          locale={locale}
          t={t}
          cardT={dict.store.card}
          images={product.images.map(({ id, url, alt }) => ({ id, url, alt }))}
          variants={variants}
          defaultVariantId={product.defaultVariantId}
          header={
            <header>
              {product.brand ? <p className="eyebrow">{product.brand.name}</p> : null}
              <h1 className="mt-3 font-display text-4xl leading-tight text-ink md:text-5xl">
                {product.name}
              </h1>
              {product.rating ? (
                <a
                  href="#reviews"
                  className="mt-3 inline-flex items-center gap-2 text-sm text-muted hover:text-ink"
                >
                  <RatingStars
                    rating={product.rating.average}
                    label={interpolate(t.ratingOutOf, {
                      rating: product.rating.average.toFixed(1),
                    })}
                  />
                  <span>{plural(locale, product.rating.count, t.reviewCount)}</span>
                </a>
              ) : null}
            </header>
          }
        >
          <div className="divide-y divide-line border-y border-line">
            <details open className="group py-5">
              <summary className="cursor-pointer list-none text-sm font-medium text-ink">
                {t.description}
              </summary>
              <p className="mt-4 text-sm leading-7 whitespace-pre-line text-text">
                {product.description}
              </p>
            </details>
            <details className="group py-5">
              <summary className="cursor-pointer list-none text-sm font-medium text-ink">
                {t.details}
              </summary>
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
                {product.brand ? (
                  <>
                    <dt className="text-muted">{t.brand}</dt>
                    <dd>{product.brand.name}</dd>
                  </>
                ) : null}
                {product.material ? (
                  <>
                    <dt className="text-muted">{t.material}</dt>
                    <dd>{product.material}</dd>
                  </>
                ) : null}
                {dims ? (
                  <>
                    <dt className="text-muted">{t.dimensions}</dt>
                    <dd className="ltr-nums">
                      {interpolate(t.dimensionsValue, {
                        length: cm(dims.length),
                        width: cm(dims.width),
                        height: cm(dims.height),
                      })}
                    </dd>
                  </>
                ) : null}
                {product.weightGrams ? (
                  <>
                    <dt className="text-muted">{t.weight}</dt>
                    <dd>{interpolate(t.weightValue, { grams: product.weightGrams })}</dd>
                  </>
                ) : null}
              </dl>
            </details>
            {product.care ? (
              <details className="group py-5">
                <summary className="cursor-pointer list-none text-sm font-medium text-ink">
                  {t.care}
                </summary>
                <p className="mt-4 text-sm leading-7 text-text">{product.care}</p>
              </details>
            ) : null}
            <details className="group py-5">
              <summary className="cursor-pointer list-none text-sm font-medium text-ink">
                {t.shippingReturns}
              </summary>
              <ul className="mt-4 space-y-2 text-sm leading-7 text-text">
                <li>{interpolate(t.shippingSummary, { days: shippingDays })}</li>
                {shipping.freeShippingThreshold !== null ? (
                  <li>
                    {interpolate(t.freeShippingSummary, {
                      amount: formatMoney(shipping.freeShippingThreshold, locale, {
                        hideZeroFraction: true,
                      }),
                    })}
                  </li>
                ) : null}
                {returns.enabled ? (
                  <li>{interpolate(t.returnsSummary, { days: returns.windowDays })}</li>
                ) : null}
              </ul>
              <Link
                href={`/${locale}/shipping`}
                className="mt-3 inline-block text-sm underline underline-offset-4"
              >
                {t.readPolicy}
              </Link>
            </details>
          </div>
        </ProductPurchase>
      </div>

      <div className="mt-20 border-t border-line pt-14">
        <ProductReviews
          locale={locale}
          t={t}
          rating={product.rating}
          reviews={reviews}
          page={reviewsPage}
          pageHref={(page) =>
            `${productPath(locale, product)}${page > 1 ? `?reviews=${page}` : ''}#reviews`
          }
          labels={{ previous: dict.common.previous, next: dict.common.next }}
        />
        <div className="mt-10 max-w-2xl">
          {eligibility.canReview ? (
            <ReviewForm
              locale={locale}
              productId={product.id}
              t={t}
              fieldMessages={dict.errors.fields}
              genericError={dict.errors.generic}
            />
          ) : eligibility.reason === 'SIGN_IN' ? (
            <Link
              href={loginPath(locale, `${productPath(locale, product)}#reviews`)}
              className="text-sm underline underline-offset-4"
            >
              {t.reviewSignIn}
            </Link>
          ) : (
            <p className="text-sm text-muted">
              {eligibility.reason === 'ALREADY_REVIEWED' ? t.reviewAlready : t.reviewOnlyBuyers}
            </p>
          )}
        </div>
      </div>

      {related.length > 0 ? (
        <section aria-labelledby="related-title" className="mt-20 border-t border-line pt-14">
          <h2 id="related-title" className="mb-8 font-display text-3xl text-ink">
            {t.related}
          </h2>
          <ProductGrid
            locale={locale}
            products={related}
            t={dict.store.card}
            actions={{ wishlistIds, t: dict.cart, genericError: dict.errors.generic }}
          />
        </section>
      ) : null}
    </div>
  )
}
