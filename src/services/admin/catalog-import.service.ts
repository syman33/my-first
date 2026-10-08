import 'server-only'
import { type DbClient, prisma, readAll } from '@/db/client'
import { isUniqueViolation } from '@/db/errors'
import type { Inventory, Product, ProductVariant } from '@/generated/prisma/client'
import {
  type FileProblem,
  groupRows,
  type ImportIssue,
  issueCode,
  type ParsedCatalogCsv,
  parseCatalogCsv,
  PRODUCT_FIELD_COLUMNS,
  type ProductGroup,
  rowValues,
  VARIANT_FIELD_COLUMNS,
} from '@/lib/admin/catalog-csv'
import { AppError } from '@/lib/errors'
import {
  type ProductInput,
  productSchema,
  type VariantInput,
  variantSchema,
} from '@/schemas/admin-catalog'
import { refreshDerived } from '@/services/admin/products.service'
import { type AuditContext, diffFields, recordAudit } from '@/services/audit/audit.service'
import { adjustStock } from '@/services/inventory/inventory.service'
import { slugify } from '@/utils/text'

/**
 * Catalogue CSV import. A file is checked in full before anything is written
 * (a "check" run writes nothing), and an import either applies every row in
 * one transaction or applies nothing: on any problem the caller gets the
 * complete list of row errors and the catalogue is untouched. New products
 * are created as drafts (they need photos before they can be published);
 * existing products keep their status. Stock changes go through the
 * inventory ledger and can never drop below units reserved for open orders.
 */

export interface ImportSummary {
  rows: number
  productsCreated: number
  productsUpdated: number
  variantsCreated: number
  variantsUpdated: number
  stockChanges: number
  unchangedRows: number
}

export interface ImportReport {
  ok: boolean
  applied: boolean
  problem: FileProblem | null
  missingColumns: string[]
  ignoredColumns: string[]
  /** First issues in row order (see issueCount for the total). */
  issues: ImportIssue[]
  issueCount: number
  summary: ImportSummary
}

const MAX_REPORTED_ISSUES = 200
const IMPORT_REASON = 'CSV import'

type ExistingVariant = ProductVariant & { inventory: Inventory | null }
type ExistingProduct = Product & { variants: ExistingVariant[] }

interface VariantPlan {
  row: number
  sku: string
  existing: ExistingVariant | null
  input: VariantInput
  /** On-hand quantity of a new variant. */
  initialStock: number
  /** Change to an existing variant's on-hand quantity. */
  stockDelta: number
  changed: boolean
}

interface ProductPlan {
  sku: string
  firstRow: number
  existing: ExistingProduct | null
  input: ProductInput
  changed: boolean
  variants: VariantPlan[]
}

const emptySummary = (rows: number): ImportSummary => ({
  rows,
  productsCreated: 0,
  productsUpdated: 0,
  variantsCreated: 0,
  variantsUpdated: 0,
  stockChanges: 0,
  unchangedRows: 0,
})

function productFields(product: Product): ProductInput {
  return {
    nameAr: product.nameAr,
    nameEn: product.nameEn,
    slugAr: product.slugAr,
    slugEn: product.slugEn,
    sku: product.sku,
    descriptionAr: product.descriptionAr,
    descriptionEn: product.descriptionEn,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    cost: product.cost,
    categoryId: product.categoryId,
    brandId: product.brandId,
    gender: product.gender,
    materialAr: product.materialAr,
    materialEn: product.materialEn,
    careAr: product.careAr,
    careEn: product.careEn,
    lengthMm: product.lengthMm,
    widthMm: product.widthMm,
    heightMm: product.heightMm,
    weightGrams: product.weightGrams,
    isFeatured: product.isFeatured,
    isBestseller: product.isBestseller,
    isNewArrival: product.isNewArrival,
    status: product.status,
    lowStockThreshold: product.lowStockThreshold,
    seoTitleAr: product.seoTitleAr,
    seoTitleEn: product.seoTitleEn,
    seoDescriptionAr: product.seoDescriptionAr,
    seoDescriptionEn: product.seoDescriptionEn,
  }
}

function variantFields(variant: ExistingVariant): VariantInput {
  return {
    sku: variant.sku,
    barcode: variant.barcode,
    nameAr: variant.nameAr,
    nameEn: variant.nameEn,
    colorFamily: variant.colorFamily,
    colorNameAr: variant.colorNameAr,
    colorNameEn: variant.colorNameEn,
    colorHex: variant.colorHex,
    size: variant.size,
    price: variant.price,
    compareAtPrice: variant.compareAtPrice,
    imageId: variant.imageId,
    isActive: variant.isActive,
    isDefault: variant.isDefault,
    sortOrder: variant.sortOrder,
    lowStockThreshold: variant.inventory?.lowStockThreshold ?? null,
  }
}

const defined = <T extends object>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>

/** Validate every row against the database as it is now (inside `db`'s transaction when applying). */
async function planImport(
  db: DbClient,
  file: ParsedCatalogCsv,
): Promise<{ plans: ProductPlan[]; issues: ImportIssue[] }> {
  const issues: ImportIssue[] = [...file.issues]
  const values = file.rows.map((row) => {
    const result = rowValues(row, file.columns)
    issues.push(...result.issues)
    return result.values
  })
  const grouped = groupRows(values)
  issues.push(...grouped.issues)
  const groups: ProductGroup[] = grouped.groups

  const productSkus = groups.map((group) => group.sku)
  const variantSkus = groups.flatMap((group) => group.variants.map((variant) => variant.sku))
  const barcodes = groups.flatMap((group) =>
    group.variants.flatMap((variant) => (variant.variant.barcode ? [variant.variant.barcode] : [])),
  )
  const [categories, brands, products, variantOwners, barcodeOwners] = await readAll(db, [
    () => db.category.findMany({ select: { id: true, slug: true, kind: true } }),
    () => db.brand.findMany({ select: { id: true, slug: true } }),
    () =>
      db.product.findMany({
        where: { sku: { in: productSkus } },
        include: { variants: { include: { inventory: true } } },
      }),
    () =>
      db.productVariant.findMany({
        where: { sku: { in: variantSkus } },
        select: { sku: true, productId: true },
      }),
    () =>
      barcodes.length
        ? db.productVariant.findMany({
            where: { barcode: { in: barcodes } },
            select: { sku: true, barcode: true },
          })
        : Promise.resolve([]),
  ])
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]))
  const brandBySlug = new Map(brands.map((brand) => [brand.slug, brand.id]))
  const productBySku = new Map(products.map((product) => [product.sku, product]))
  const ownerBySku = new Map(variantOwners.map((variant) => [variant.sku, variant.productId]))
  const skuByBarcode = new Map(barcodeOwners.map((variant) => [variant.barcode, variant.sku]))

  const plans: ProductPlan[] = []
  for (const group of groups) {
    const existing = productBySku.get(group.sku) ?? null
    const cells = group.product
    const at = (column: ImportIssue['column'], code: ImportIssue['code']) =>
      issues.push({ row: group.firstRow, column, code })

    let categoryId = existing?.categoryId ?? ''
    // Required fields: an empty cell keeps the current value (a new product must provide it).
    if (cells.categorySlug) {
      const category = categoryBySlug.get(cells.categorySlug)
      if (!category || category.kind !== 'STANDARD') at('category', 'unknownCategory')
      else categoryId = category.id
    } else if (!existing) at('category', 'required')

    let brandId = existing?.brandId ?? null
    if (cells.brandSlug !== undefined) {
      const found = cells.brandSlug === null ? null : brandBySlug.get(cells.brandSlug)
      if (found === undefined) at('brand', 'unknownBrand')
      else brandId = found
    }

    const base = existing ? productFields(existing) : null
    const nameAr = cells.nameAr || base?.nameAr || ''
    const nameEn = cells.nameEn || base?.nameEn || ''
    if ((cells.price === null || cells.price === undefined) && !existing) at('price', 'required')
    const candidate = {
      // New products: everything not in the file starts empty, as a draft.
      descriptionAr: '',
      descriptionEn: '',
      compareAtPrice: null,
      cost: null,
      gender: 'UNISEX' as const,
      materialAr: null,
      materialEn: null,
      careAr: null,
      careEn: null,
      lengthMm: null,
      widthMm: null,
      heightMm: null,
      weightGrams: null,
      isFeatured: false,
      isBestseller: false,
      isNewArrival: false,
      status: 'DRAFT' as const,
      lowStockThreshold: 3,
      seoTitleAr: null,
      seoTitleEn: null,
      seoDescriptionAr: null,
      seoDescriptionEn: null,
      ...base,
      ...defined({
        descriptionAr: cells.descriptionAr,
        descriptionEn: cells.descriptionEn,
        gender: cells.gender,
        compareAtPrice: cells.compareAtPrice,
        materialAr: cells.materialAr,
        materialEn: cells.materialEn,
      }),
      sku: group.sku,
      nameAr,
      nameEn,
      slugAr: cells.slugAr ?? base?.slugAr ?? slugify(nameAr),
      slugEn: cells.slugEn ?? base?.slugEn ?? slugify(nameEn),
      price: cells.price ?? base?.price ?? 1,
      categoryId,
      brandId,
    }
    const parsedProduct = productSchema.safeParse(candidate)
    if (!parsedProduct.success) {
      for (const issue of parsedProduct.error.issues) {
        const column = PRODUCT_FIELD_COLUMNS[String(issue.path[0])] ?? null
        // Missing references are already reported with a clearer code.
        if (column === 'category' || column === 'brand') continue
        issues.push({ row: group.firstRow, column, code: issueCode(issue.message) })
      }
    }

    // Variants
    const plannedVariants: VariantPlan[] = []
    let nextSortOrder =
      Math.max(-1, ...(existing?.variants.map((variant) => variant.sortOrder) ?? [])) + 1
    group.variants.forEach((row, index) => {
      const owner = ownerBySku.get(row.sku)
      if (owner !== undefined && owner !== existing?.id) {
        issues.push({ row: row.row, column: 'variant_sku', code: 'skuOtherProduct' })
        return
      }
      const current = existing?.variants.find((variant) => variant.sku === row.sku) ?? null
      const baseVariant: VariantInput = current
        ? variantFields(current)
        : {
            sku: row.sku,
            barcode: null,
            nameAr: '',
            nameEn: '',
            colorFamily: null,
            colorNameAr: null,
            colorNameEn: null,
            colorHex: null,
            size: null,
            price: null,
            compareAtPrice: null,
            imageId: null,
            isActive: true,
            // A new product's first row becomes its default variant.
            isDefault: !existing && index === 0,
            sortOrder: nextSortOrder++,
            lowStockThreshold: null,
          }
      const parsedVariant = variantSchema.safeParse({
        ...baseVariant,
        ...defined(row.variant),
        // Required names: an empty cell keeps the current name (a new variant must provide one).
        nameAr: row.variant.nameAr || baseVariant.nameAr,
        nameEn: row.variant.nameEn || baseVariant.nameEn,
      })
      if (!parsedVariant.success) {
        for (const issue of parsedVariant.error.issues) {
          issues.push({
            row: row.row,
            column: VARIANT_FIELD_COLUMNS[String(issue.path[0])] ?? null,
            code: issueCode(issue.message),
          })
        }
        return
      }
      const variant = parsedVariant.data
      if (variant.barcode && (skuByBarcode.get(variant.barcode) ?? row.sku) !== row.sku) {
        issues.push({ row: row.row, column: 'barcode', code: 'barcodeTaken' })
        return
      }
      let stockDelta = 0
      const initialStock = current ? 0 : (row.stock ?? 0)
      if (current && typeof row.stock === 'number') {
        const onHand = current.inventory?.onHand ?? 0
        const reserved = current.inventory?.reserved ?? 0
        if (row.stock < reserved) {
          issues.push({ row: row.row, column: 'stock', code: 'belowReserved' })
          return
        }
        stockDelta = row.stock - onHand
      }
      plannedVariants.push({
        row: row.row,
        sku: row.sku,
        existing: current,
        input: variant,
        initialStock,
        stockDelta,
        changed: !current || Object.keys(diffFields(variantFields(current), variant)).length > 0,
      })
    })

    // A published product must keep a variant shoppers can buy.
    if (existing?.status === 'PUBLISHED') {
      const touched = new Map(plannedVariants.map((plan) => [plan.sku, plan.input.isActive]))
      const active =
        existing.variants.filter((variant) => touched.get(variant.sku) ?? variant.isActive).length +
        plannedVariants.filter((plan) => !plan.existing && plan.input.isActive).length
      if (active === 0) {
        issues.push({
          row: group.variants[0]?.row ?? group.firstRow,
          column: 'active',
          code: 'lastActiveVariant',
        })
      }
    }

    // Variants were still checked above, so one run reports every problem in the file.
    if (!parsedProduct.success) continue
    const input = parsedProduct.data
    plans.push({
      sku: group.sku,
      firstRow: group.firstRow,
      existing,
      input,
      changed: !existing || Object.keys(diffFields(productFields(existing), input)).length > 0,
      variants: plannedVariants,
    })
  }

  // Product addresses must stay unique (across the file and the catalogue).
  const slugOwners = await db.product.findMany({
    where: {
      OR: [
        { slugAr: { in: plans.map((plan) => plan.input.slugAr) } },
        { slugEn: { in: plans.map((plan) => plan.input.slugEn) } },
      ],
    },
    select: { sku: true, slugAr: true, slugEn: true },
  })
  for (const field of ['slugAr', 'slugEn'] as const) {
    const owners = new Map(slugOwners.map((owner) => [owner[field], owner.sku]))
    const seen = new Map<string, string>()
    for (const plan of plans) {
      const slug = plan.input[field]
      const otherInFile = seen.get(slug)
      const otherInCatalogue = owners.get(slug)
      if (
        (otherInFile !== undefined && otherInFile !== plan.sku) ||
        (otherInCatalogue !== undefined && otherInCatalogue !== plan.sku)
      ) {
        issues.push({
          row: plan.firstRow,
          column: field === 'slugAr' ? 'slug_ar' : 'slug_en',
          code: 'slugTaken',
        })
      }
      seen.set(slug, plan.sku)
    }
  }
  return { plans, issues }
}

function summarise(rows: number, plans: readonly ProductPlan[]): ImportSummary {
  const summary = emptySummary(rows)
  for (const plan of plans) {
    if (!plan.existing) summary.productsCreated++
    else if (plan.changed) summary.productsUpdated++
    for (const variant of plan.variants) {
      if (!variant.existing) summary.variantsCreated++
      else if (variant.changed) summary.variantsUpdated++
      if (variant.stockDelta !== 0) summary.stockChanges++
      if (variant.existing && !variant.changed && variant.stockDelta === 0 && !plan.changed) {
        summary.unchangedRows++
      }
    }
  }
  return summary
}

function report(
  base: Pick<ImportReport, 'ignoredColumns'> & Partial<ImportReport>,
  issues: ImportIssue[],
  summary: ImportSummary,
): ImportReport {
  const sorted = [...issues].sort((a, b) => a.row - b.row)
  return {
    ok: issues.length === 0 && !base.problem,
    applied: base.applied ?? false,
    problem: base.problem ?? null,
    missingColumns: base.missingColumns ?? [],
    ignoredColumns: base.ignoredColumns,
    issues: sorted.slice(0, MAX_REPORTED_ISSUES),
    issueCount: issues.length,
    summary,
  }
}

function fileProblemReport(parsed: Exclude<ReturnType<typeof parseCatalogCsv>, { ok: true }>) {
  return report(
    { ignoredColumns: [], problem: parsed.problem, missingColumns: parsed.columns ?? [] },
    [],
    emptySummary(0),
  )
}

/** Validate a file and describe what an import would change, without writing anything. */
export async function checkCatalogImport(bytes: Uint8Array): Promise<ImportReport> {
  const parsed = parseCatalogCsv(bytes)
  if (!parsed.ok) return fileProblemReport(parsed)
  const { plans, issues } = await planImport(prisma, parsed.file)
  return report(
    { ignoredColumns: parsed.file.ignoredColumns },
    issues,
    summarise(parsed.file.rows.length, plans),
  )
}

class ImportRejected extends Error {
  constructor(readonly report: ImportReport) {
    super('Import rejected')
  }
}

/** Apply a file: every row in one transaction, or nothing at all. */
export async function applyCatalogImport(
  bytes: Uint8Array,
  audit: AuditContext,
): Promise<ImportReport> {
  const parsed = parseCatalogCsv(bytes)
  if (!parsed.ok) return fileProblemReport(parsed)
  const file = parsed.file
  try {
    return await prisma.$transaction(
      async (tx) => {
        // Re-validated against the data inside this transaction: a preview is never trusted.
        const { plans, issues } = await planImport(tx, file)
        const summary = summarise(file.rows.length, plans)
        if (issues.length > 0) {
          throw new ImportRejected(report({ ignoredColumns: file.ignoredColumns }, issues, summary))
        }
        const ledger = {
          reason: IMPORT_REASON,
          actorType: audit.actor.type,
          actorId: audit.actor.id,
        }
        for (const plan of plans) {
          const { status: _status, ...data } = plan.input
          let productId: string
          if (!plan.existing) {
            productId = (
              await tx.product.create({
                data: { ...data, status: 'DRAFT', minPrice: data.price, maxPrice: data.price },
                select: { id: true },
              })
            ).id
          } else {
            productId = plan.existing.id
            if (plan.changed) await tx.product.update({ where: { id: productId }, data })
          }
          for (const variant of plan.variants) {
            const { lowStockThreshold, ...variantData } = variant.input
            if (!variant.existing) {
              const created = await tx.productVariant.create({
                data: {
                  ...variantData,
                  productId,
                  inventory: { create: { onHand: variant.initialStock, lowStockThreshold } },
                },
                select: { id: true },
              })
              if (variant.initialStock > 0) {
                await tx.inventoryTransaction.create({
                  data: {
                    variantId: created.id,
                    type: 'IMPORT',
                    quantityDelta: variant.initialStock,
                    previousOnHand: 0,
                    newOnHand: variant.initialStock,
                    previousReserved: 0,
                    newReserved: 0,
                    ...ledger,
                  },
                })
              }
              continue
            }
            if (variant.changed) {
              await tx.productVariant.update({
                where: { id: variant.existing.id },
                data: variantData,
              })
            }
            if (variant.stockDelta !== 0) {
              await adjustStock(
                tx,
                {
                  variantId: variant.existing.id,
                  sku: variant.sku,
                  quantity: Math.abs(variant.stockDelta),
                  delta: variant.stockDelta,
                },
                'IMPORT',
                ledger,
              )
            }
          }
          const touched =
            !plan.existing || plan.changed || plan.variants.some((v) => !v.existing || v.changed)
          if (touched) await refreshDerived(tx, productId)
          if (touched || plan.variants.some((v) => v.stockDelta !== 0)) {
            await recordAudit(tx, audit, {
              action: plan.existing ? 'product.updated' : 'product.created',
              entityType: 'product',
              entityId: productId,
              metadata: {
                sku: plan.sku,
                via: 'csv_import',
                ...(plan.existing
                  ? { changes: diffFields(productFields(plan.existing), plan.input) }
                  : {}),
                variants: plan.variants.map((v) => ({
                  sku: v.sku,
                  created: !v.existing,
                  changed: v.changed,
                  stockDelta: v.existing ? v.stockDelta : v.initialStock,
                })),
              },
            })
          }
        }
        await recordAudit(tx, audit, {
          action: 'catalog.imported',
          entityType: 'catalog',
          metadata: { ...summary },
        })
        return report({ ignoredColumns: file.ignoredColumns, applied: true }, [], summary)
      },
      { timeout: 120_000, maxWait: 15_000 },
    )
  } catch (error) {
    if (error instanceof ImportRejected) return error.report
    if (isUniqueViolation(error)) {
      // Someone changed the catalogue between validation and writing: nothing was applied.
      throw new AppError('IMPORT_INVALID', 'The catalogue changed during the import', {
        status: 409,
        details: { reason: 'CHANGED_DURING_IMPORT' },
      })
    }
    throw error
  }
}
