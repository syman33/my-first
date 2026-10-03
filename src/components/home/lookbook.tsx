import Image from 'next/image'
import { interpolate } from '@/i18n'

const LOOKS = [1, 2, 3, 4, 5, 6] as const

/** Instagram-style editorial grid (curated imagery, not a live social feed). */
export function Lookbook({
  title,
  text,
  altTemplate,
}: {
  title: string
  text: string
  altTemplate: string
}) {
  return (
    <section aria-labelledby="lookbook-title" className="py-14 lg:py-20">
      <div className="container-luxe">
        <h2 id="lookbook-title" className="font-display text-3xl text-ink md:text-4xl">
          {title}
        </h2>
        <p className="mt-3 max-w-xl text-muted">{text}</p>
      </div>
      <ul className="mt-10 grid grid-cols-2 gap-1 md:grid-cols-3 lg:grid-cols-6">
        {LOOKS.map((number) => (
          <li key={number} className="relative aspect-square overflow-hidden bg-sand">
            <Image
              src={`/images/gallery/look-${number}.webp`}
              alt={interpolate(altTemplate, { number })}
              fill
              sizes="(min-width: 1024px) 17vw, (min-width: 768px) 33vw, 50vw"
              className="object-cover"
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
