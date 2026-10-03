import { inflateSync } from 'node:zlib'

/**
 * Convert a WOFF 1.0 font to a plain SFNT (TTF/OTF) buffer, which HarfBuzz can
 * load. WOFF 1.0 stores each SFNT table zlib-compressed (when that saves space)
 * with a directory of offsets; we inflate and re-assemble them.
 */
export function woffToSfnt(woff: Buffer): Buffer {
  if (woff.toString('ascii', 0, 4) !== 'wOFF') throw new Error('Not a WOFF 1.0 file')
  const flavor = woff.readUInt32BE(4)
  const numTables = woff.readUInt16BE(12)

  const tables: Array<{ tag: string; checksum: number; data: Buffer }> = []
  for (let i = 0; i < numTables; i++) {
    const entry = 44 + i * 20
    const tag = woff.toString('ascii', entry, entry + 4)
    const offset = woff.readUInt32BE(entry + 4)
    const compLength = woff.readUInt32BE(entry + 8)
    const origLength = woff.readUInt32BE(entry + 12)
    const checksum = woff.readUInt32BE(entry + 16)
    const raw = woff.subarray(offset, offset + compLength)
    const data = compLength < origLength ? inflateSync(raw) : Buffer.from(raw)
    if (data.length !== origLength)
      throw new Error(`Table ${tag}: expected ${origLength} bytes, got ${data.length}`)
    tables.push({ tag, checksum, data })
  }
  tables.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))

  const entrySelector = Math.floor(Math.log2(numTables))
  const searchRange = 2 ** entrySelector * 16
  const headerSize = 12 + numTables * 16
  const padded = (n: number) => (n + 3) & ~3
  const total = tables.reduce((sum, t) => sum + padded(t.data.length), headerSize)

  const out = Buffer.alloc(total)
  out.writeUInt32BE(flavor, 0)
  out.writeUInt16BE(numTables, 4)
  out.writeUInt16BE(searchRange, 6)
  out.writeUInt16BE(entrySelector, 8)
  out.writeUInt16BE(numTables * 16 - searchRange, 10)
  let dataOffset = headerSize
  tables.forEach((table, i) => {
    const record = 12 + i * 16
    out.write(table.tag, record, 4, 'ascii')
    out.writeUInt32BE(table.checksum, record + 4)
    out.writeUInt32BE(dataOffset, record + 8)
    out.writeUInt32BE(table.data.length, record + 12)
    table.data.copy(out, dataOffset)
    dataOffset += padded(table.data.length)
  })
  return out
}
