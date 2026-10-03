import { ProductSkeleton } from '@/components/catalog/skeletons'
import { getDictionary } from '@/i18n'
import { defaultLocale, isLocale } from '@/i18n/config'
import { locale as rootLocale } from 'next/root-params'

export default async function Loading() {
  const segment = await rootLocale()
  return (
    <ProductSkeleton
      label={getDictionary(isLocale(segment) ? segment : defaultLocale).common.loading}
    />
  )
}
