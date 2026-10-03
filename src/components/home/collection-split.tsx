import Image from 'next/image'
import Link from 'next/link'
import type { Route } from 'next'

export interface CollectionTile {
  href: string
  title: string
  description: string | null
  cta: string
  imageUrl: string | null
}

/** Two large editorial tiles (the women's and men's edits). */
export function CollectionSplit({ tiles, label }: { tiles: CollectionTile[]; label: string }) {
  if (tiles.length === 0) return null
  return (
    <section aria-label={label} className="container-luxe py-6 lg:py-10">
      <ul className="grid gap-4 md:grid-cols-2 lg:gap-6">
        {tiles.map((tile) => (
          <li key={tile.href}>
            <Link
              href={tile.href as Route}
              className="group relative block aspect-[4/5] overflow-hidden bg-sand md:aspect-[5/6]"
            >
              {tile.imageUrl ? (
                <Image
                  src={tile.imageUrl}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 48vw, 100vw"
                  className="object-cover transition-transform duration-700 ease-luxe group-hover:scale-[1.02]"
                />
              ) : null}
              <div
                className="absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent to-transparent"
                aria-hidden="true"
              />
              <div className="absolute inset-x-0 bottom-0 p-6 text-paper lg:p-10">
                <h2 className="font-display text-4xl lg:text-5xl">{tile.title}</h2>
                {tile.description ? (
                  <p className="mt-3 max-w-sm text-sm leading-7 text-paper/90">
                    {tile.description}
                  </p>
                ) : null}
                <span className="mt-5 inline-block border-b border-paper pb-1 text-sm">
                  {tile.cta}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
