import type {
  CategoryKind,
  ColorFamily,
  Gender,
  InventoryMovementType,
  ProductStatus,
} from '@/generated/prisma/enums'

/** Back-office catalogue shapes passed to client components. */

export interface AdminProductRow {
  id: string
  sku: string
  nameAr: string
  nameEn: string
  status: ProductStatus
  minPrice: number
  maxPrice: number
  categoryNameAr: string
  categoryNameEn: string
  imageUrl: string | null
  variantCount: number
  available: number
  lowStock: boolean
  updatedAt: Date
}

export interface AdminVariantView {
  id: string
  sku: string
  barcode: string | null
  nameAr: string
  nameEn: string
  colorFamily: ColorFamily | null
  colorNameAr: string | null
  colorNameEn: string | null
  colorHex: string | null
  size: string | null
  price: number | null
  compareAtPrice: number | null
  imageId: string | null
  isActive: boolean
  isDefault: boolean
  sortOrder: number
  lowStockThreshold: number | null
  onHand: number
  reserved: number
}

export interface AdminImageView {
  id: string
  url: string
  altAr: string | null
  altEn: string | null
  width: number | null
  height: number | null
  sortOrder: number
}

export interface AdminProductDetail {
  id: string
  nameAr: string
  nameEn: string
  slugAr: string
  slugEn: string
  sku: string
  descriptionAr: string
  descriptionEn: string
  price: number
  compareAtPrice: number | null
  cost: number | null
  categoryId: string
  brandId: string | null
  gender: Gender
  materialAr: string | null
  materialEn: string | null
  careAr: string | null
  careEn: string | null
  lengthMm: number | null
  widthMm: number | null
  heightMm: number | null
  weightGrams: number | null
  isFeatured: boolean
  isBestseller: boolean
  isNewArrival: boolean
  status: ProductStatus
  lowStockThreshold: number
  seoTitleAr: string | null
  seoTitleEn: string | null
  seoDescriptionAr: string | null
  seoDescriptionEn: string | null
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
  hasOrders: boolean
  variants: AdminVariantView[]
  images: AdminImageView[]
}

export interface CatalogOption {
  id: string
  nameAr: string
  nameEn: string
  kind?: CategoryKind
  parentId?: string | null
  isActive: boolean
}

export interface InventoryRow {
  variantId: string
  productId: string
  productNameAr: string
  productNameEn: string
  variantNameAr: string
  variantNameEn: string
  sku: string
  onHand: number
  reserved: number
  available: number
  threshold: number
  isActive: boolean
  productStatus: ProductStatus
}

export interface InventoryMovementView {
  id: string
  type: InventoryMovementType
  quantityDelta: number
  reservedDelta: number
  newOnHand: number
  newReserved: number
  reason: string | null
  orderId: string | null
  actorName: string | null
  createdAt: Date
}
