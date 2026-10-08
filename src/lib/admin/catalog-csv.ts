import Papa from 'papaparse'
import { ColorFamily, Gender } from '@/generated/prisma/enums'
import { halalasToSarString, sarToHalalas } from '@/utils/money'

/**
 * Product catalogue CSV: the file format shared by export and import, and
 * every check that needs no database (encoding, columns, value formats,
 * duplicates and contradictions inside the file). One row per variant;
 * product columns repeat on each of a product's rows.
 *
 * Only columns present in the file are applied, so a file with just
 * `product_sku, variant_sku, stock` updates stock and nothing else. In a
 * present column an empty cell keeps the current value of a required field
 * (names, category, price, slug, gender), leaves stock unchanged, and clears
 * an optional value.
 */

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024
export const MAX_IMPORT_ROWS = 2_000

export const PRODUCT_COLUMNS = [
  'product_sku',
  'name_ar',
  'name_en',
  'slug_ar',
  'slug_en',
  'description_ar',
  'description_en',
  'category',
  'brand',
  'gender',
  'price',
  'compare_at_price',
  'material_ar',
  'material_en',
] as const

export const VARIANT_COLUMNS = [
  'variant_sku',
  'variant_name_ar',
  'variant_name_en',
  'color_family',
  'color_name_ar',
  'color_name_en',
  'color_hex',
  'size',
  'variant_price',
  'variant_compare_at_price',
  'barcode',
  'active',
  'stock',
] as const

export const IMPORT_COLUMNS = [...PRODUCT_COLUMNS, ...VARIANT_COLUMNS] as const
/** Exported for reference, ignored on import (status changes need photos; reservations belong to orders). */
export const EXPORT_ONLY_COLUMNS = ['status', 'reserved', 'available'] as const
export const REQUIRED_HEADERS = ['product_sku', 'variant_sku'] as const

export type ImportColumn = (typeof IMPORT_COLUMNS)[number]

/** Row-level problems; each code has a message in the dictionary. */
export type ImportIssueCode =
  | 'required'
  | 'invalid'
  | 'amount'
  | 'quantity'
  | 'tooShort'
  | 'tooLong'
  | 'sku'
  | 'slug'
  | 'compareAtPrice'
  | 'fieldCount'
  | 'duplicateInFile'
  | 'productMismatch'
  | 'unknownCategory'
  | 'unknownBrand'
  | 'skuOtherProduct'
  | 'slugTaken'
  | 'barcodeTaken'
  | 'belowReserved'
  | 'lastActiveVariant'

export interface ImportIssue {
  /** Spreadsheet row number (the header is row 1). */
  row: number
  column: ImportColumn | null
  code: ImportIssueCode
}

export type FileProblem = 'ENCODING' | 'EMPTY' | 'TOO_MANY_ROWS' | 'MISSING_COLUMNS' | 'MALFORMED'

export interface ParsedCatalogCsv {
  columns: ReadonlySet<ImportColumn>
  /** Headers that are not import columns (export-only columns included). */
  ignoredColumns: string[]
  rows: { row: number; cells: Partial<Record<ImportColumn, string>> }[]
  issues: ImportIssue[]
}

const FORMULA_GUARD = /^'(?=[=+\-@\t\r])/

/** Undo the export's spreadsheet-formula guard (a leading apostrophe) and trim. */
export function cleanCell(value: string | undefined): string {
  return (value ?? '').replace(FORMULA_GUARD, '').trim()
}

function isImportColumn(value: string): value is ImportColumn {
  return (IMPORT_COLUMNS as readonly string[]).includes(value)
}

export function parseCatalogCsv(
  bytes: Uint8Array,
): { ok: true; file: ParsedCatalogCsv } | { ok: false; problem: FileProblem; columns?: string[] } {
  let text: string
  try {
    // Fatal decoding: a file saved in a legacy encoding is refused, never imported garbled.
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return { ok: false, problem: 'ENCODING' }
  }
  if (text.trim() === '') return { ok: false, problem: 'EMPTY' }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: false,
    transformHeader: (header) => header.trim().toLowerCase(),
  })
  if (parsed.errors.some((error) => error.type === 'Quotes')) {
    return { ok: false, problem: 'MALFORMED' }
  }
  const headers = parsed.meta.fields ?? []
  const missing = REQUIRED_HEADERS.filter((column) => !headers.includes(column))
  if (missing.length > 0) return { ok: false, problem: 'MISSING_COLUMNS', columns: missing }

  const columns = new Set(headers.filter(isImportColumn))
  const ignoredColumns = headers.filter((header) => header !== '' && !isImportColumn(header))
  const fieldErrors = new Set(
    parsed.errors.filter((error) => error.type === 'FieldMismatch').map((error) => error.row),
  )
  const rows: ParsedCatalogCsv['rows'] = []
  const issues: ImportIssue[] = []
  parsed.data.forEach((record, index) => {
    const row = index + 2
    const cells: Partial<Record<ImportColumn, string>> = {}
    let blank = true
    for (const column of columns) {
      const value = cleanCell(record[column])
      cells[column] = value
      if (value !== '') blank = false
    }
    if (blank) return // empty spreadsheet rows are skipped, not errors
    if (fieldErrors.has(index)) issues.push({ row, column: null, code: 'fieldCount' })
    rows.push({ row, cells })
  })
  if (rows.length === 0) return { ok: false, problem: 'EMPTY' }
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, problem: 'TOO_MANY_ROWS' }
  return { ok: true, file: { columns, ignoredColumns, rows, issues } }
}

// ---------------------------------------------------------------------------
// Row values
// ---------------------------------------------------------------------------

export interface ProductCells {
  nameAr?: string
  nameEn?: string
  /** null: keep the existing slug (or derive one for a new product). */
  slugAr?: string | null
  slugEn?: string | null
  descriptionAr?: string
  descriptionEn?: string
  categorySlug?: string
  brandSlug?: string | null
  gender?: Gender
  price?: number | null
  compareAtPrice?: number | null
  materialAr?: string | null
  materialEn?: string | null
}

export interface VariantCells {
  nameAr?: string
  nameEn?: string
  colorFamily?: ColorFamily | null
  colorNameAr?: string | null
  colorNameEn?: string | null
  colorHex?: string | null
  size?: string | null
  price?: number | null
  compareAtPrice?: number | null
  barcode?: string | null
  isActive?: boolean
}

export interface RowValues {
  row: number
  productSku: string
  variantSku: string
  product: ProductCells
  variant: VariantCells
  /** undefined: no stock column · null: blank (unchanged) · number: new on-hand quantity. */
  stock: number | null | undefined
}

const TRUE_WORDS = new Set(['yes', 'true', '1', 'y', 'نعم'])
const FALSE_WORDS = new Set(['no', 'false', '0', 'n', 'لا'])

/** SAR text → halalas; '' → null; invalid → undefined. */
function money(text: string): number | null | undefined {
  if (text === '') return null
  try {
    const value = sarToHalalas(text)
    return value >= 0 ? value : undefined
  } catch {
    return undefined
  }
}

const orNull = (text: string) => (text === '' ? null : text)

export function rowValues(
  input: ParsedCatalogCsv['rows'][number],
  columns: ReadonlySet<ImportColumn>,
): { values: RowValues; issues: ImportIssue[] } {
  const { row, cells } = input
  const issues: ImportIssue[] = []
  const cell = (column: ImportColumn) => cells[column] ?? ''
  const has = (column: ImportColumn) => columns.has(column)
  const fail = (column: ImportColumn, code: ImportIssueCode) => issues.push({ row, column, code })

  const product: ProductCells = {}
  if (has('name_ar')) product.nameAr = cell('name_ar')
  if (has('name_en')) product.nameEn = cell('name_en')
  if (has('slug_ar')) product.slugAr = orNull(cell('slug_ar'))
  if (has('slug_en')) product.slugEn = orNull(cell('slug_en'))
  if (has('description_ar')) product.descriptionAr = cell('description_ar')
  if (has('description_en')) product.descriptionEn = cell('description_en')
  if (has('category')) product.categorySlug = cell('category').toLowerCase()
  if (has('brand')) product.brandSlug = orNull(cell('brand').toLowerCase())
  if (has('gender')) {
    // Blank keeps the current value (new products default to unisex).
    const gender = cell('gender').toUpperCase()
    if ((Object.values(Gender) as string[]).includes(gender)) product.gender = gender as Gender
    else if (gender !== '') fail('gender', 'invalid')
  }
  for (const [column, key] of [
    ['price', 'price'],
    ['compare_at_price', 'compareAtPrice'],
  ] as const) {
    if (!has(column)) continue
    const value = money(cell(column))
    if (value === undefined) fail(column, 'amount')
    else product[key] = value
  }
  if (has('material_ar')) product.materialAr = orNull(cell('material_ar'))
  if (has('material_en')) product.materialEn = orNull(cell('material_en'))

  const variant: VariantCells = {}
  if (has('variant_name_ar')) variant.nameAr = cell('variant_name_ar')
  if (has('variant_name_en')) variant.nameEn = cell('variant_name_en')
  if (has('color_family')) {
    const family = cell('color_family').toUpperCase()
    if (family === '') variant.colorFamily = null
    else if ((Object.values(ColorFamily) as string[]).includes(family))
      variant.colorFamily = family as ColorFamily
    else fail('color_family', 'invalid')
  }
  if (has('color_name_ar')) variant.colorNameAr = orNull(cell('color_name_ar'))
  if (has('color_name_en')) variant.colorNameEn = orNull(cell('color_name_en'))
  if (has('color_hex')) variant.colorHex = orNull(cell('color_hex'))
  if (has('size')) variant.size = orNull(cell('size'))
  for (const [column, key] of [
    ['variant_price', 'price'],
    ['variant_compare_at_price', 'compareAtPrice'],
  ] as const) {
    if (!has(column)) continue
    const value = money(cell(column))
    if (value === undefined) fail(column, 'amount')
    else variant[key] = value
  }
  if (has('barcode')) variant.barcode = orNull(cell('barcode'))
  if (has('active')) {
    const word = cell('active').toLowerCase()
    if (word === '' || TRUE_WORDS.has(word)) variant.isActive = true
    else if (FALSE_WORDS.has(word)) variant.isActive = false
    else fail('active', 'invalid')
  }

  let stock: number | null | undefined
  if (has('stock')) {
    const text = cell('stock')
    if (text === '') stock = null
    else if (/^\d{1,6}$/.test(text)) stock = Number(text)
    else fail('stock', 'quantity')
  }

  const productSku = cell('product_sku').toUpperCase()
  const variantSku = cell('variant_sku').toUpperCase()
  if (productSku === '') fail('product_sku', 'required')
  if (variantSku === '') fail('variant_sku', 'required')
  return { values: { row, productSku, variantSku, product, variant, stock }, issues }
}

// ---------------------------------------------------------------------------
// Grouping and in-file checks
// ---------------------------------------------------------------------------

export interface ProductGroup {
  sku: string
  firstRow: number
  product: ProductCells
  variants: { row: number; sku: string; variant: VariantCells; stock: number | null | undefined }[]
}

const PRODUCT_CELL_COLUMNS: Record<keyof ProductCells, ImportColumn> = {
  nameAr: 'name_ar',
  nameEn: 'name_en',
  slugAr: 'slug_ar',
  slugEn: 'slug_en',
  descriptionAr: 'description_ar',
  descriptionEn: 'description_en',
  categorySlug: 'category',
  brandSlug: 'brand',
  gender: 'gender',
  price: 'price',
  compareAtPrice: 'compare_at_price',
  materialAr: 'material_ar',
  materialEn: 'material_en',
}

/**
 * Group rows by product. A product's columns must agree on every row: a later
 * row may leave them empty, but a different value is an error, never silently
 * ignored. Variant SKUs and barcodes must be unique within the file.
 */
export function groupRows(rows: readonly RowValues[]): {
  groups: ProductGroup[]
  issues: ImportIssue[]
} {
  const issues: ImportIssue[] = []
  const groups = new Map<string, ProductGroup>()
  const variantRows = new Map<string, number>()
  const barcodes = new Map<string, number>()
  for (const values of rows) {
    if (!values.productSku || !values.variantSku) continue
    let group = groups.get(values.productSku)
    if (!group) {
      group = {
        sku: values.productSku,
        firstRow: values.row,
        product: values.product,
        variants: [],
      }
      groups.set(values.productSku, group)
    } else {
      // Later rows may leave product cells empty (they inherit the first row's values).
      for (const key of Object.keys(values.product) as (keyof ProductCells)[]) {
        const value = values.product[key]
        if (value === undefined || value === null || value === '') continue
        if (value !== group.product[key]) {
          issues.push({
            row: values.row,
            column: PRODUCT_CELL_COLUMNS[key],
            code: 'productMismatch',
          })
        }
      }
    }
    if (variantRows.has(values.variantSku)) {
      issues.push({ row: values.row, column: 'variant_sku', code: 'duplicateInFile' })
      continue
    }
    variantRows.set(values.variantSku, values.row)
    const barcode = values.variant.barcode
    if (barcode) {
      if (barcodes.has(barcode)) {
        issues.push({ row: values.row, column: 'barcode', code: 'duplicateInFile' })
      } else barcodes.set(barcode, values.row)
    }
    group.variants.push({
      row: values.row,
      sku: values.variantSku,
      variant: values.variant,
      stock: values.stock,
    })
  }
  return { groups: [...groups.values()], issues }
}

/** Where a schema field's error belongs in the file. */
export const PRODUCT_FIELD_COLUMNS: Record<string, ImportColumn> = {
  ...Object.fromEntries(
    Object.entries(PRODUCT_CELL_COLUMNS).filter(
      ([key]) => key !== 'categorySlug' && key !== 'brandSlug',
    ),
  ),
  sku: 'product_sku',
  categoryId: 'category',
  brandId: 'brand',
}

export const VARIANT_FIELD_COLUMNS: Record<string, ImportColumn> = {
  sku: 'variant_sku',
  nameAr: 'variant_name_ar',
  nameEn: 'variant_name_en',
  colorFamily: 'color_family',
  colorNameAr: 'color_name_ar',
  colorNameEn: 'color_name_en',
  colorHex: 'color_hex',
  size: 'size',
  price: 'variant_price',
  compareAtPrice: 'variant_compare_at_price',
  barcode: 'barcode',
  isActive: 'active',
}

const ISSUE_CODES = new Set<string>([
  'required',
  'invalid',
  'amount',
  'quantity',
  'tooShort',
  'tooLong',
  'sku',
  'slug',
  'compareAtPrice',
])

/** A schema message (dictionary key) as an import issue code. */
export function issueCode(message: string): ImportIssueCode {
  return ISSUE_CODES.has(message) ? (message as ImportIssueCode) : 'invalid'
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface ExportVariant {
  sku: string
  nameAr: string
  nameEn: string
  colorFamily: string | null
  colorNameAr: string | null
  colorNameEn: string | null
  colorHex: string | null
  size: string | null
  price: number | null
  compareAtPrice: number | null
  barcode: string | null
  isActive: boolean
  onHand: number
  reserved: number
}

export interface ExportProduct {
  sku: string
  nameAr: string
  nameEn: string
  slugAr: string
  slugEn: string
  descriptionAr: string
  descriptionEn: string
  categorySlug: string
  brandSlug: string | null
  gender: string
  price: number
  compareAtPrice: number | null
  materialAr: string | null
  materialEn: string | null
  status: string
  variants: ExportVariant[]
}

export type CatalogCsvRow = Record<
  (typeof IMPORT_COLUMNS)[number] | (typeof EXPORT_ONLY_COLUMNS)[number],
  string
>

const sar = (halalas: number | null) => (halalas === null ? '' : halalasToSarString(halalas))

/** One row per variant, in the import format (plus reference columns). */
export function catalogExportRows(products: readonly ExportProduct[]): CatalogCsvRow[] {
  return products.flatMap((product) =>
    product.variants.map((variant) => ({
      product_sku: product.sku,
      name_ar: product.nameAr,
      name_en: product.nameEn,
      slug_ar: product.slugAr,
      slug_en: product.slugEn,
      description_ar: product.descriptionAr,
      description_en: product.descriptionEn,
      category: product.categorySlug,
      brand: product.brandSlug ?? '',
      gender: product.gender,
      price: sar(product.price),
      compare_at_price: sar(product.compareAtPrice),
      material_ar: product.materialAr ?? '',
      material_en: product.materialEn ?? '',
      variant_sku: variant.sku,
      variant_name_ar: variant.nameAr,
      variant_name_en: variant.nameEn,
      color_family: variant.colorFamily ?? '',
      color_name_ar: variant.colorNameAr ?? '',
      color_name_en: variant.colorNameEn ?? '',
      color_hex: variant.colorHex ?? '',
      size: variant.size ?? '',
      variant_price: sar(variant.price),
      variant_compare_at_price: sar(variant.compareAtPrice),
      barcode: variant.barcode ?? '',
      active: variant.isActive ? 'yes' : 'no',
      stock: String(variant.onHand),
      status: product.status,
      reserved: String(variant.reserved),
      available: String(variant.onHand - variant.reserved),
    })),
  )
}

export const CATALOG_EXPORT_COLUMNS = [...IMPORT_COLUMNS, ...EXPORT_ONLY_COLUMNS].map((column) => ({
  key: column,
  header: column,
}))
