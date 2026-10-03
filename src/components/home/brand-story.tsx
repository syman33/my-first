import Image from 'next/image'
import type { Route } from 'next'
import { ButtonLink } from '@/components/ui/button'

export function BrandStory({
  eyebrow,
  title,
  text,
  cta,
}: {
  eyebrow: string
  title: string
  text: string
  cta: { href: string; label: string }
}) {
  return (
    <section aria-labelledby="brand-story" className="container-luxe py-14 lg:py-24">
      <div className="grid items-center gap-10 md:grid-cols-2 lg:gap-20">
        <div className="relative aspect-[4/5] overflow-hidden bg-sand">
          <Image
            src="/images/editorial/brand-story.webp"
            alt=""
            fill
            sizes="(min-width: 768px) 45vw, 100vw"
            className="object-cover"
          />
        </div>
        <div className="max-w-lg">
          <p className="eyebrow">{eyebrow}</p>
          <h2
            id="brand-story"
            className="mt-4 font-display text-4xl leading-tight text-ink md:text-5xl"
          >
            {title}
          </h2>
          <p className="mt-6 leading-8 text-text">{text}</p>
          <ButtonLink href={cta.href as Route} variant="secondary" className="mt-8">
            {cta.label}
          </ButtonLink>
        </div>
      </div>
    </section>
  )
}
