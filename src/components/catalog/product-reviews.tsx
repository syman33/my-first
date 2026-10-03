import Link from 'next/link'
import type { Route } from 'next'
import { BadgeCheck } from 'lucide-react'
import type { Dictionary } from '@/i18n'
import { interpolate, plural } from '@/i18n'
import type { Locale } from '@/i18n/config'
import { formatDate } from '@/i18n/format'
import type { ReviewSummary } from '@/types/catalog'
import { RatingStars } from './rating-stars'

interface ProductReviewsProps {
  locale: Locale
  t: Dictionary['store']['product']
  rating: { average: number; count: number } | null
  reviews: ReviewSummary
  page: number
  pageHref: (page: number) => string
  labels: { previous: string; next: string }
}

export function ProductReviews({
  locale,
  t,
  rating,
  reviews,
  page,
  pageHref,
  labels,
}: ProductReviewsProps) {
  const pages = reviews.pageCount
  return (
    <section id="reviews" aria-labelledby="reviews-title" className="scroll-mt-40">
      <h2 id="reviews-title" className="font-display text-3xl text-ink">
        {t.reviewsTitle}
      </h2>
      {rating && reviews.total > 0 ? (
        <div className="mt-8 grid gap-10 lg:grid-cols-[16rem_1fr] lg:gap-16">
          <div>
            <p className="ltr-nums font-display text-5xl text-ink">{rating.average.toFixed(1)}</p>
            <RatingStars
              className="mt-2"
              rating={rating.average}
              label={interpolate(t.ratingOutOf, { rating: rating.average.toFixed(1) })}
            />
            <p className="mt-2 text-sm text-muted">{plural(locale, rating.count, t.reviewCount)}</p>
            <ul className="mt-6 space-y-2">
              {([5, 4, 3, 2, 1] as const).map((stars) => {
                const count = reviews.distribution[stars]
                const share = reviews.total > 0 ? (count / reviews.total) * 100 : 0
                return (
                  <li key={stars} className="flex items-center gap-3 text-xs text-muted">
                    <span className="w-14 shrink-0">
                      {interpolate(t.starsLabel, { count: stars })}
                    </span>
                    <span className="h-1 flex-1 bg-line" aria-hidden="true">
                      <span
                        className="block h-full bg-champagne-strong"
                        style={{ width: `${share}%` }}
                      />
                    </span>
                    <span className="ltr-nums w-6 shrink-0 text-end">{count}</span>
                  </li>
                )
              })}
            </ul>
          </div>
          <div>
            <ul className="divide-y divide-line">
              {reviews.items.map((review) => (
                <li key={review.id} className="py-6 first:pt-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <RatingStars
                      rating={review.rating}
                      label={interpolate(t.ratingOutOf, { rating: review.rating })}
                    />
                    {review.title ? <p className="font-medium text-ink">{review.title}</p> : null}
                  </div>
                  <p className="mt-3 text-sm leading-7 whitespace-pre-line text-text">
                    {review.body}
                  </p>
                  <p className="mt-3 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                    <span>{review.author}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={review.createdAt.toISOString()}>
                      {formatDate(review.createdAt, locale)}
                    </time>
                    {review.verified ? (
                      <span className="inline-flex items-center gap-1 text-success">
                        <BadgeCheck className="size-3.5" aria-hidden="true" />
                        {t.verifiedPurchase}
                      </span>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
            {pages > 1 ? (
              <div className="mt-6 flex items-center gap-6 text-sm">
                {page > 1 ? (
                  <Link
                    href={pageHref(page - 1) as Route}
                    className="underline underline-offset-4"
                    scroll={false}
                  >
                    {labels.previous}
                  </Link>
                ) : null}
                {page < pages ? (
                  <Link
                    href={pageHref(page + 1) as Route}
                    className="underline underline-offset-4"
                    scroll={false}
                  >
                    {labels.next}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-6 text-muted">{t.noReviews}</p>
      )}
    </section>
  )
}
