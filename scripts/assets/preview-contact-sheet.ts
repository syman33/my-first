/**
 * Renders a contact sheet of every demo product (all variants) for visual
 * review of the generated artwork: `npx tsx scripts/assets/preview-contact-sheet.ts <out.png>`.
 */
import sharp from 'sharp'
import { products } from '../../prisma/seed/data/catalog'
import { renderProductSvg } from './art/products'

const out = process.argv[2] ?? 'contact-sheet.png'
const tileW = 240
const tileH = 300
const cells: Array<{ svg: string }> = []
for (const product of products) {
  for (const variant of product.variants.slice(0, 2)) {
    cells.push({
      svg: renderProductSvg(
        { kind: product.art, color: variant.hex, metal: variant.metal, accent: variant.accent },
        { smallWatch: product.gender === 'WOMEN' },
      ),
    })
  }
}
const columns = 10
const rows = Math.ceil(cells.length / columns)
const composites = await Promise.all(
  cells.map(async (cell, index) => ({
    input: await sharp(Buffer.from(cell.svg)).resize(tileW, tileH).png().toBuffer(),
    left: (index % columns) * tileW,
    top: Math.floor(index / columns) * tileH,
  })),
)
await sharp({ create: { width: columns * tileW, height: rows * tileH, channels: 3, background: '#ffffff' } })
  .composite(composites)
  .png()
  .toFile(out)
console.log(`wrote ${out} (${cells.length} tiles)`)
