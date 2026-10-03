import Image from 'next/image'
import Link from 'next/link'
import type { Route } from 'next'

export interface PromoBanner {
  id: string
  title: string
  subtitle: string | null
  ctaLabel: string | null
  href: string | null
  imageUrl: string
  alt: string
}

function Card({ banner }: { banner: PromoBanner }) {
  const body = (
    <>
      <div className="relative aspect-[8/5] overflow-hidden bg-sand">
        <Image
          src={banner.imageUrl}
          alt={banner.alt}
          fill
          sizes="(min-width: 1024px) 31vw, (min-width: 768px) 48vw, 100vw"
          className="object-cover transition-transform duration-700 ease-luxe group-hover:scale-[1.02]"
        />
      </div>
      <h3 className="mt-5 font-display text-2xl text-ink">{banner.title}</h3>
      {banner.subtitle ? (
        <p className="mt-2 text-sm leading-7 text-muted">{banner.subtitle}</p>
      ) : null}
      {banner.ctaLabel && banner.href ? (
        <span className="mt-4 inline-block border-b border-ink pb-1 text-sm text-ink">
          {banner.ctaLabel}
        </span>
      ) : null}
    </>
  )
  if (!banner.href) return <div>{body}</div>
  const external = /^https:\/\//.test(banner.href)
  return external ? (
    <a href={banner.href} className="group block" rel="noopener">
      {body}
    </a>
  ) : (
    <Link href={banner.href as Route} className="group block">
      {body}
    </Link>
  )
}

/** Admin-managed promotional banners (only those live right now are passed in). */
export function PromoBanners({ banners, label }: { banners: PromoBanner[]; label: string }) {
  if (banners.length === 0) return null
  return (
    <section aria-label={label} className="bg-paper py-14 lg:py-20">
      <ul className="container-luxe grid gap-10 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
        {banners.map((banner) => (
          <li key={banner.id}>
            <Card banner={banner} />
          </li>
        ))}
      </ul>
    </section>
  )
}
