import Image, { getImageProps } from 'next/image'
import type { Route } from 'next'
import { ButtonLink } from '@/components/ui/button'

interface HeroProps {
  eyebrow: string
  title: string
  text: string | null
  primary: { label: string; href: string }
  secondary?: { label: string; href: string }
  image: { desktop: string; mobile: string | null; alt: string }
}

/**
 * Different crops for phones and desktops in one <picture>, so each device
 * downloads only its own image (two <Image priority> would fetch both).
 */
function ArtDirectedImage({
  desktop,
  mobile,
  alt,
}: {
  desktop: string
  mobile: string
  alt: string
}) {
  const common = { alt, fill: true, sizes: '100vw', priority: true }
  const {
    props: { srcSet: desktopSrcSet },
  } = getImageProps({ ...common, src: desktop })
  const { props: mobileProps } = getImageProps({ ...common, src: mobile })
  return (
    <picture>
      <source media="(min-width: 768px)" srcSet={desktopSrcSet} sizes="100vw" />
      <img {...mobileProps} alt={alt} className="object-cover" />
    </picture>
  )
}

/** Full-bleed editorial hero; the image is the LCP element, so it loads with priority. */
export function Hero({ eyebrow, title, text, primary, secondary, image }: HeroProps) {
  return (
    <section className="relative isolate overflow-hidden bg-sand" aria-labelledby="hero-title">
      <div className="relative h-[78svh] min-h-[32rem] w-full lg:h-[86svh]">
        {image.mobile ? (
          <ArtDirectedImage desktop={image.desktop} mobile={image.mobile} alt={image.alt} />
        ) : (
          <Image
            src={image.desktop}
            alt={image.alt}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        )}
        <div
          className="absolute inset-0 bg-gradient-to-t from-ink/55 via-ink/10 to-transparent md:bg-gradient-to-l rtl:md:bg-gradient-to-r"
          aria-hidden="true"
        />
        <div className="container-luxe relative flex h-full items-end pb-16 md:items-center md:pb-0">
          <div className="max-w-xl text-paper">
            <p className="eyebrow text-paper/85">{eyebrow}</p>
            <h1
              id="hero-title"
              className="mt-4 font-display text-5xl leading-[1.1] md:text-6xl lg:text-7xl"
            >
              {title}
            </h1>
            {text ? (
              <p className="mt-5 max-w-md text-base leading-8 text-paper/90 md:text-lg">{text}</p>
            ) : null}
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink
                href={primary.href as Route}
                size="lg"
                className="border-paper bg-paper text-ink hover:bg-ivory"
              >
                {primary.label}
              </ButtonLink>
              {secondary ? (
                <ButtonLink
                  href={secondary.href as Route}
                  size="lg"
                  variant="secondary"
                  className="border-paper text-paper hover:bg-paper hover:text-ink"
                >
                  {secondary.label}
                </ButtonLink>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
