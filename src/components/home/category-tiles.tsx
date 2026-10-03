import Image from 'next/image'
import Link from 'next/link'
import type { Route } from 'next'
import type { Locale } from '@/i18n/config'
import { SectionHeading } from './section-heading'

export interface CategoryTile {
  slug: string
  name: string
  imageUrl: string | null
}

export function CategoryTiles({
  locale,
  title,
  tiles,
}: {
  locale: Locale
  title: string
  tiles: CategoryTile[]
}) {
  if (tiles.length === 0) return null
  return (
    <section aria-labelledby="home-categories" className="container-luxe py-14 lg:py-20">
      <SectionHeading id="home-categories" locale={locale} title={title} />
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5 lg:gap-6">
        {tiles.map((tile, index) => (
          <li key={tile.slug} className={index === 0 ? 'col-span-2 md:col-span-1' : undefined}>
            <Link href={`/${locale}/${tile.slug}` as Route} className="group block">
              <div className="relative aspect-[4/5] overflow-hidden bg-sand">
                {tile.imageUrl ? (
                  <Image
                    src={tile.imageUrl}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 18vw, (min-width: 768px) 30vw, 46vw"
                    className="object-cover transition-transform duration-700 ease-luxe group-hover:scale-[1.03]"
                  />
                ) : null}
              </div>
              <p className="mt-3 text-center font-display text-xl text-ink">{tile.name}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
