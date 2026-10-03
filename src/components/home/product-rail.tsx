import { ProductGrid } from '@/components/catalog/product-grid'
import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import type { ProductCardData } from '@/lib/catalog/presentation'
import { SectionHeading } from './section-heading'

/** A titled row of products; renders nothing when the section has no products. */
export function ProductRailSection({
  id,
  locale,
  title,
  products,
  viewAll,
  cardT,
}: {
  id: string
  locale: Locale
  title: string
  products: ProductCardData[]
  viewAll: { href: string; label: string }
  cardT: Dictionary['store']['card']
}) {
  if (products.length === 0) return null
  return (
    <section aria-labelledby={id} className="container-luxe py-14 lg:py-20">
      <SectionHeading id={id} locale={locale} title={title} link={viewAll} />
      <ProductGrid locale={locale} products={products} t={cardT} />
    </section>
  )
}
