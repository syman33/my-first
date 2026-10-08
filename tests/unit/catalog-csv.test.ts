import { describe, expect, it } from 'vitest'
import {
  CATALOG_EXPORT_COLUMNS,
  catalogExportRows,
  type ExportProduct,
  groupRows,
  parseCatalogCsv,
  rowValues,
} from '@/lib/admin/catalog-csv'
import { toCsv } from '@/lib/csv'

const encode = (text: string) => new TextEncoder().encode(text)

function parse(text: string) {
  const result = parseCatalogCsv(encode(text))
  if (!result.ok) throw new Error(`unexpected ${result.problem}`)
  return result.file
}

function values(text: string) {
  const file = parse(text)
  const rows = file.rows.map((row) => rowValues(row, file.columns))
  return { file, rows: rows.map((row) => row.values), issues: rows.flatMap((row) => row.issues) }
}

const product: ExportProduct = {
  sku: 'VLR-BAG-001',
  nameAr: 'حقيبة أميرة الجلدية',
  nameEn: '=Amara "Leather" Tote',
  slugAr: 'حقيبة-أميرة',
  slugEn: 'amara-tote',
  descriptionAr: 'جلد طبيعي،\nبطانة قطنية',
  descriptionEn: 'Full-grain leather, cotton lining',
  categorySlug: 'bags',
  brandSlug: null,
  gender: 'WOMEN',
  price: 89_900,
  compareAtPrice: 109_950,
  materialAr: null,
  materialEn: 'Leather',
  status: 'PUBLISHED',
  variants: [
    {
      sku: 'VLR-BAG-001-BLK',
      nameAr: 'أسود',
      nameEn: 'Black',
      colorFamily: 'BLACK',
      colorNameAr: 'أسود',
      colorNameEn: 'Black',
      colorHex: '#1A1A1A',
      size: null,
      price: null,
      compareAtPrice: null,
      barcode: '6281234567890',
      isActive: true,
      onHand: 12,
      reserved: 2,
    },
    {
      sku: 'VLR-BAG-001-TAN',
      nameAr: 'بني فاتح',
      nameEn: 'Tan',
      colorFamily: 'TAN',
      colorNameAr: null,
      colorNameEn: null,
      colorHex: null,
      size: null,
      price: 94_900,
      compareAtPrice: null,
      barcode: null,
      isActive: false,
      onHand: 0,
      reserved: 0,
    },
  ],
}

describe('catalogue CSV files', () => {
  it('round-trips an export back into the same values (Arabic, quotes, line breaks, formula guard)', () => {
    const csv = toCsv(catalogExportRows([product]), CATALOG_EXPORT_COLUMNS)
    expect(csv.startsWith('﻿')).toBe(true)
    // The exported name is guarded against spreadsheet formulas…
    expect(csv).toContain(`"'=Amara ""Leather"" Tote"`)
    const { file, rows, issues } = values(csv)
    expect(issues).toEqual([])
    expect(file.ignoredColumns).toEqual(['status', 'reserved', 'available'])
    // …and the import removes the guard again.
    expect(rows[0]!.product).toMatchObject({
      nameAr: 'حقيبة أميرة الجلدية',
      nameEn: '=Amara "Leather" Tote',
      descriptionAr: 'جلد طبيعي،\nبطانة قطنية',
      categorySlug: 'bags',
      brandSlug: null,
      gender: 'WOMEN',
      price: 89_900,
      compareAtPrice: 109_950,
      materialAr: null,
    })
    expect(rows[0]!.variant).toMatchObject({
      colorFamily: 'BLACK',
      colorHex: '#1A1A1A',
      price: null,
      barcode: '6281234567890',
      isActive: true,
    })
    expect(rows[0]!.stock).toBe(12)
    expect(rows[1]!.variant).toMatchObject({ price: 94_900, isActive: false, colorNameAr: null })
    const { groups, issues: groupIssues } = groupRows(rows)
    expect(groupIssues).toEqual([])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.variants.map((variant) => variant.sku)).toEqual([
      'VLR-BAG-001-BLK',
      'VLR-BAG-001-TAN',
    ])
  })

  it('refuses files it cannot read safely', () => {
    expect(parseCatalogCsv(new Uint8Array([0x70, 0xff, 0xfe, 0x00]))).toMatchObject({
      ok: false,
      problem: 'ENCODING',
    })
    expect(parseCatalogCsv(encode('  \n'))).toMatchObject({ ok: false, problem: 'EMPTY' })
    expect(parseCatalogCsv(encode('product_sku,stock\nA-1,3\n'))).toMatchObject({
      ok: false,
      problem: 'MISSING_COLUMNS',
      columns: ['variant_sku'],
    })
    expect(parseCatalogCsv(encode('product_sku,variant_sku\n"A-1,B-1\n'))).toMatchObject({
      ok: false,
      problem: 'MALFORMED',
    })
    const tooMany = [
      'product_sku,variant_sku',
      ...Array.from({ length: 2_001 }, (_, i) => `P-${i},V-${i}`),
    ]
    expect(parseCatalogCsv(encode(tooMany.join('\n')))).toMatchObject({
      ok: false,
      problem: 'TOO_MANY_ROWS',
    })
  })

  it('applies only the columns in the file, numbering rows like a spreadsheet', () => {
    const { file, rows, issues } = values(
      'Product_SKU ; Variant_SKU ; Stock\nvlr-bag-001;vlr-bag-001-blk;7\n;;\nvlr-bag-001;vlr-bag-001-tan;\n',
    )
    expect([...file.columns]).toEqual(['product_sku', 'variant_sku', 'stock'])
    expect(issues).toEqual([])
    expect(rows).toEqual([
      {
        row: 2,
        productSku: 'VLR-BAG-001',
        variantSku: 'VLR-BAG-001-BLK',
        product: {},
        variant: {},
        stock: 7,
      },
      // Row 3 is empty and skipped; row 4 leaves stock unchanged.
      {
        row: 4,
        productSku: 'VLR-BAG-001',
        variantSku: 'VLR-BAG-001-TAN',
        product: {},
        variant: {},
        stock: null,
      },
    ])
  })

  it('reports unreadable values with their row and column', () => {
    const { issues } = values(
      'product_sku,variant_sku,price,stock,active,gender,color_family\n' +
        'P-1,V-1,12.345,-3,maybe,KIDS,ULTRAVIOLET\n' +
        ',V-2,10,1,yes,,\n',
    )
    expect(issues).toEqual([
      { row: 2, column: 'gender', code: 'invalid' },
      { row: 2, column: 'price', code: 'amount' },
      { row: 2, column: 'color_family', code: 'invalid' },
      { row: 2, column: 'active', code: 'invalid' },
      { row: 2, column: 'stock', code: 'quantity' },
      { row: 3, column: 'product_sku', code: 'required' },
    ])
  })

  it('catches contradictions and duplicates inside the file', () => {
    const { rows } = values(
      'product_sku,variant_sku,name_en,price,barcode\n' +
        'P-1,V-1,Tote,100,111111\n' +
        'P-1,V-2,,100,222222\n' + // empty product cells inherit the first row
        'P-1,V-3,Clutch,100,111111\n' +
        'P-1,V-1,Tote,120,\n',
    )
    const { groups, issues } = groupRows(rows)
    expect(issues).toEqual([
      { row: 4, column: 'name_en', code: 'productMismatch' },
      { row: 4, column: 'barcode', code: 'duplicateInFile' },
      { row: 5, column: 'price', code: 'productMismatch' },
      { row: 5, column: 'variant_sku', code: 'duplicateInFile' },
    ])
    expect(groups[0]!.variants.map((variant) => variant.sku)).toEqual(['V-1', 'V-2', 'V-3'])
  })
})
