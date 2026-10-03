/**
 * CSV for exports opened in Excel/Sheets. Cells are always quoted when
 * needed, and any cell a spreadsheet would treat as a formula (starting with
 * = + - @, tab or carriage return) is prefixed with an apostrophe so an
 * exported customer name like `=HYPERLINK(...)` can never execute (CSV
 * injection). A UTF-8 BOM keeps Arabic text readable in Excel.
 */

export type CsvValue = string | number | boolean | Date | null | undefined

const FORMULA_PREFIX = /^[=+\-@\t\r]/

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  let text = value instanceof Date ? value.toISOString() : String(value)
  if (typeof value === 'string' && FORMULA_PREFIX.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv<T extends Record<string, CsvValue>>(
  rows: readonly T[],
  columns: readonly { key: keyof T & string; header: string }[],
): string {
  const lines = [columns.map((column) => csvCell(column.header)).join(',')]
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column.key])).join(','))
  return `﻿${lines.join('\r\n')}\r\n`
}

/** Response headers for a CSV download (never cached: exports contain personal data). */
export function csvHeaders(filename: string): HeadersInit {
  return {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  }
}
