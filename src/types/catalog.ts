import type { ColorFamily, Gender } from '@/generated/prisma/enums'
import type { ProductCardData } from '@/lib/catalog/presentation'

/** Data-transfer shapes shared by catalogue services (producers) and UI (consumers). */

export interface ListingPage {
  items: ProductCardData[]
  total: number
  page: number
  pageCount: number
  pageSize: number
}

export interface ListingFacets {
  colors: ColorFamily[]
  brands: { slug: string; nameAr: string; nameEn: string }[]
  genders: Gender[]
  categories: { slug: string; nameAr: string; nameEn: string }[]
  /** Halalas; null when the scope is empty. */
  priceRange: { min: number; max: number } | null
}

export interface ReviewView {
  id: string
  rating: number
  title: string | null
  body: string
  /** First name only — reviews never reveal full names or contact details. */
  author: string
  verified: boolean
  createdAt: Date
}

export interface ReviewSummary {
  items: ReviewView[]
  total: number
  pageCount: number
  distribution: Record<1 | 2 | 3 | 4 | 5, number>
}
