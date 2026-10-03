import { describe, expect, it } from 'vitest'
import { csvCell, csvHeaders, toCsv } from '@/lib/csv'

describe('CSV export', () => {
  it('quotes separators, quotes and line breaks', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
    expect(csvCell(' padded ')).toBe('" padded "')
    expect(csvCell(null)).toBe('')
    expect(csvCell(12_500)).toBe('12500')
  })

  it('neutralises spreadsheet formulas in text cells', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`)
    expect(csvCell('+966500000000')).toBe("'+966500000000")
    expect(csvCell('-1')).toBe("'-1")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    // Numbers stay numbers.
    expect(csvCell(-1)).toBe('-1')
  })

  it('writes a BOM, a header row and CRLF lines, keeping Arabic intact', () => {
    const csv = toCsv(
      [{ name: 'نورة', email: 'noura@example.test' }],
      [
        { key: 'name', header: 'Name' },
        { key: 'email', header: 'Email' },
      ],
    )
    expect(csv).toBe('﻿Name,Email\r\nنورة,noura@example.test\r\n')
  })

  it('sanitises the download file name', () => {
    expect(csvHeaders('subscribers 2026/10.csv')).toMatchObject({
      'content-disposition': 'attachment; filename="subscribers_2026_10.csv"',
      'cache-control': 'no-store',
    })
  })
})
