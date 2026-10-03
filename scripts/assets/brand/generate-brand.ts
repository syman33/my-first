/**
 * Generates the VÉLORA logo system from the brand typefaces (glyph outlines
 * shaped with HarfBuzz, so the Arabic wordmark joins correctly):
 *
 *   public/brand/velora-monogram-{black,white,champagne}.svg
 *   public/brand/velora-logo-horizontal-{black,white}.svg
 *   public/brand/velora-wordmark-{black,white}.svg
 *   public/brand/og-default.png           (1200×630 social card)
 *   src/app/icon.svg, src/app/apple-icon.png, src/app/favicon.ico
 *   src/components/brand/logo-data.ts     (paths for the inline React logo)
 *
 *   npx tsx scripts/assets/brand/generate-brand.ts
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import * as hb from 'harfbuzzjs'
import sharp from 'sharp'
import { woffToSfnt } from './woff'

const ROOT = path.resolve(import.meta.dirname, '../../..')
const INK = '#171717'
const IVORY = '#f7f4ef'
const CHAMPAGNE = '#b89b72'
const CHAMPAGNE_STRONG = '#7d6342'

interface ShapedText {
  /** SVG path data already positioned in its own coordinate space (baseline y=0). */
  d: string
  width: number
  ascent: number
}

async function loadFont(file: string) {
  const data = woffToSfnt(await readFile(path.join(ROOT, file)))
  const face = new hb.Face(new hb.Blob(new Uint8Array(data).buffer))
  return { font: new hb.Font(face), upem: face.upem }
}

/** Shape text and bake every glyph into absolute path commands (no transforms). */
function shapeText(
  f: { font: hb.Font; upem: number },
  text: string,
  size: number,
  tracking = 0,
): ShapedText {
  const buffer = new hb.Buffer()
  buffer.addText(text)
  buffer.guessSegmentProperties()
  hb.shape(f.font, buffer)
  const infos = buffer.getGlyphInfos()
  const positions = buffer.getGlyphPositions()
  const s = size / f.upem
  let x = 0
  const parts: string[] = []
  infos.forEach((info, i) => {
    const pos = positions[i]!
    const ox = x + pos.xOffset * s
    const oy = -pos.yOffset * s
    parts.push(
      transformPath(f.font.glyphToPath(info.codepoint), (px, py) => [ox + px * s, oy - py * s]),
    )
    x += pos.xAdvance * s + tracking
  })
  return { d: parts.join(''), width: x - tracking, ascent: size * 0.7 }
}

/** Apply a point transform to absolute M/L/Q/C/Z path data (HarfBuzz emits absolute commands). */
function transformPath(d: string, map: (x: number, y: number) => [number, number]): string {
  const tokens = d.match(/[MLQCZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []
  let out = ''
  let i = 0
  while (i < tokens.length) {
    const cmd = tokens[i++]!
    const count = { M: 1, L: 1, Q: 2, C: 3, Z: 0 }[cmd.toUpperCase() as 'M' | 'L' | 'Q' | 'C' | 'Z']
    out += cmd.toUpperCase()
    for (let p = 0; p < count; p++) {
      const [x, y] = map(Number(tokens[i]), Number(tokens[i + 1]))
      i += 2
      out += `${x.toFixed(2)} ${y.toFixed(2)}${p < count - 1 ? ' ' : ''}`
    }
  }
  return out
}

function offset(d: string, dx: number, dy: number): string {
  return transformPath(d, (x, y) => [x + dx, y + dy])
}

async function main(): Promise<void> {
  const serif600 = await loadFont(
    'node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff',
  )
  const serif500 = await loadFont(
    'node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff',
  )
  const naskh = await loadFont(
    'node_modules/@fontsource/noto-naskh-arabic/files/noto-naskh-arabic-arabic-500-normal.woff',
  )

  // ---------------------------------------------------------------- Monogram (64×64 design grid)
  const v = shapeText(serif600, 'V', 56)
  const monogramV = offset(v.d, 32 - v.width / 2, 48.5)
  const frame = { x: 7, y: 7, size: 50, rx: 13.5, stroke: 2 }
  const frameRect = (stroke: string) =>
    `<rect x="${frame.x}" y="${frame.y}" width="${frame.size}" height="${frame.size}" rx="${frame.rx}" fill="none" stroke="${stroke}" stroke-width="${frame.stroke}"/>`
  const monogram = (frameColor: string, vColor: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="VÉLORA">${frameRect(frameColor)}<path d="${monogramV}" fill="${vColor}"/></svg>`

  // ---------------------------------------------------------------- Wordmarks
  const latin = shapeText(serif500, 'VÉLORA', 40, 13)
  const arabic = shapeText(naskh, 'فيلورا', 22)

  // Horizontal lockup: monogram (64) + gap + stacked Latin/Arabic wordmarks.
  const lockupHeight = 64
  const textX = 64 + 22
  const latinY = 36 // baseline
  const arabicY = 60
  const lockupWidth = Math.ceil(textX + Math.max(latin.width, arabic.width) + 2)
  const horizontal = (color: string, accent: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lockupWidth} ${lockupHeight}" role="img" aria-label="VÉLORA فيلورا">${frameRect(color)}<path d="${monogramV}" fill="${color}"/><path d="${offset(latin.d, textX, latinY)}" fill="${color}"/><path d="${offset(arabic.d, textX + latin.width - arabic.width, arabicY)}" fill="${accent}"/></svg>`
  const wordmark = (color: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(latin.width + 2)} 40" role="img" aria-label="VÉLORA"><path d="${offset(latin.d, 1, 32)}" fill="${color}"/></svg>`

  const brandDir = path.join(ROOT, 'public/brand')
  await mkdir(brandDir, { recursive: true })
  const files: Record<string, string> = {
    'velora-monogram-black.svg': monogram(INK, INK),
    'velora-monogram-white.svg': monogram('#ffffff', '#ffffff'),
    'velora-monogram-champagne.svg': monogram(CHAMPAGNE, INK),
    'velora-logo-horizontal-black.svg': horizontal(INK, CHAMPAGNE_STRONG),
    'velora-logo-horizontal-white.svg': horizontal('#ffffff', CHAMPAGNE),
    'velora-wordmark-black.svg': wordmark(INK),
    'velora-wordmark-white.svg': wordmark('#ffffff'),
  }
  for (const [name, svg] of Object.entries(files))
    await writeFile(path.join(brandDir, name), `${svg}\n`)

  // ---------------------------------------------------------------- App icons
  // Favicon: ivory V on an ink tile (legible on light and dark browser chrome).
  const appIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${INK}"/><rect x="9" y="9" width="46" height="46" rx="10" fill="none" stroke="${CHAMPAGNE}" stroke-width="1.6"/><path d="${offset(shapeText(serif600, 'V', 50).d, 32 - shapeText(serif600, 'V', 50).width / 2, 46)}" fill="${IVORY}"/></svg>`
  await writeFile(path.join(ROOT, 'src/app/icon.svg'), `${appIcon}\n`)
  await sharp(Buffer.from(appIcon))
    .resize(180, 180)
    .png()
    .toFile(path.join(ROOT, 'src/app/apple-icon.png'))

  const icoSizes = [16, 32, 48]
  const pngs = await Promise.all(
    icoSizes.map((size) => sharp(Buffer.from(appIcon)).resize(size, size).png().toBuffer()),
  )
  const header = Buffer.alloc(6 + icoSizes.length * 16)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(icoSizes.length, 4)
  let dataOffset = header.length
  icoSizes.forEach((size, i) => {
    const entry = 6 + i * 16
    header.writeUInt8(size, entry)
    header.writeUInt8(size, entry + 1)
    header.writeUInt8(0, entry + 2)
    header.writeUInt8(0, entry + 3)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(pngs[i]!.length, entry + 8)
    header.writeUInt32LE(dataOffset, entry + 12)
    dataOffset += pngs[i]!.length
  })
  await writeFile(path.join(ROOT, 'src/app/favicon.ico'), Buffer.concat([header, ...pngs]))

  // ---------------------------------------------------------------- Default social card
  const tagAr = shapeText(naskh, 'أناقتك تبدأ من التفاصيل', 44)
  const tagEn = shapeText(serif500, 'Bags · Watches · Accessories', 30, 2)
  const bigLatin = shapeText(serif500, 'VÉLORA', 96, 34)
  const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="${IVORY}"/>
    <rect x="40" y="40" width="1120" height="550" fill="none" stroke="#e7e2da" stroke-width="2"/>
    <g transform="translate(564 118) scale(1.125)">${frameRect(INK)}<path d="${monogramV}" fill="${INK}"/></g>
    <path d="${offset(bigLatin.d, 600 - bigLatin.width / 2, 322)}" fill="${INK}"/>
    <rect x="560" y="356" width="80" height="2" fill="${CHAMPAGNE}"/>
    <path d="${offset(tagAr.d, 600 - tagAr.width / 2, 432)}" fill="${INK}"/>
    <path d="${offset(tagEn.d, 600 - tagEn.width / 2, 494)}" fill="${CHAMPAGNE_STRONG}"/>
  </svg>`
  await sharp(Buffer.from(og))
    .png({ compressionLevel: 9 })
    .toFile(path.join(brandDir, 'og-default.png'))

  // ---------------------------------------------------------------- React logo data
  const ts = `// Generated by scripts/assets/brand/generate-brand.ts — do not edit by hand.
export const MONOGRAM_V = ${JSON.stringify(monogramV)}
export const MONOGRAM_FRAME = ${JSON.stringify(frame)}
export const WORDMARK_LATIN = { d: ${JSON.stringify(offset(latin.d, 0, 30))}, width: ${latin.width.toFixed(2)}, height: 32 } as const
export const WORDMARK_ARABIC = { d: ${JSON.stringify(offset(arabic.d, 0, 20))}, width: ${arabic.width.toFixed(2)}, height: 28 } as const
`
  await mkdir(path.join(ROOT, 'src/components/brand'), { recursive: true })
  await writeFile(path.join(ROOT, 'src/components/brand/logo-data.ts'), ts)
  console.log('brand assets generated')
}

await main()
