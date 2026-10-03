import type { Dictionary } from '@/i18n'
import type { Locale } from '@/i18n/config'
import type { ProductCardData } from '@/lib/catalog/presentation'
import { ProductCard } from './product-card'

/** 2 columns on phones, 3 on tablets, 4 on desktop. */
export function ProductGrid({
  locale,
  products,
  t,
  priorityCount = 0,
}: {
  locale: Locale
  products: ProductCardData[]
  t: Dictionary['store']['card']
  priorityCount?: number
}) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:gap-x-6 xl:grid-cols-4">
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard locale={locale} product={product} t={t} priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  )
}
