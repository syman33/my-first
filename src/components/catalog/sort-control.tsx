import type { Dictionary } from '@/i18n'
import { SORT_OPTIONS, type ListingFilters } from '@/schemas/catalog'
import { AutoSubmitForm } from './auto-submit-form'

interface SortControlProps {
  action: string
  t: Dictionary['store']['listing']
  filters: ListingFilters
}

/** Sort as a GET form carrying the current filters; changes apply immediately with JavaScript. */
export function SortControl({ action, t, filters }: SortControlProps) {
  return (
    <AutoSubmitForm action={action} autoSubmit className="flex items-center gap-2">
      {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
      {filters.categories.map((slug) => (
        <input key={`c-${slug}`} type="hidden" name="category" value={slug} />
      ))}
      {filters.genders.map((gender) => (
        <input key={`g-${gender}`} type="hidden" name="gender" value={gender.toLowerCase()} />
      ))}
      {filters.colors.map((color) => (
        <input key={`k-${color}`} type="hidden" name="color" value={color.toLowerCase()} />
      ))}
      {filters.brands.map((slug) => (
        <input key={`b-${slug}`} type="hidden" name="brand" value={slug} />
      ))}
      {filters.minPrice !== null ? (
        <input type="hidden" name="min" value={Math.floor(filters.minPrice / 100)} />
      ) : null}
      {filters.maxPrice !== null ? (
        <input type="hidden" name="max" value={Math.floor(filters.maxPrice / 100)} />
      ) : null}
      {filters.inStock ? <input type="hidden" name="instock" value="1" /> : null}
      {filters.onSale ? <input type="hidden" name="sale" value="1" /> : null}
      <label htmlFor="listing-sort" className="text-sm text-muted">
        {t.sortLabel}
      </label>
      <select
        id="listing-sort"
        name="sort"
        defaultValue={filters.sort}
        className="h-10 border border-line-strong bg-paper px-3 text-sm focus:border-ink focus:outline-none"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {t.sort[option]}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="h-10 border border-ink px-3 text-sm">
          {t.applyFilters}
        </button>
      </noscript>
    </AutoSubmitForm>
  )
}
