/**
 * Generates the demo catalogue imagery (product shots, category tiles, hero,
 * brand story, gallery and promo banners) as optimised WebP files under
 * public/images. Deterministic: re-running produces the same files.
 *
 *   npx tsx scripts/assets/generate-images.ts
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  colorKey,
  detailImagePath,
  PRODUCT_IMAGE_SIZE,
  products,
  variantImagePath,
  type SeedProduct,
} from '../../prisma/seed/data/catalog'
import { darken } from './art/color'
import { type ArtInput, type Placement, renderProductSvg, renderScene } from './art/products'

const PUBLIC_DIR = path.resolve(import.meta.dirname, '../../public')

async function writeWebp(publicPath: string, svg: string, quality = 84): Promise<void> {
  const file = path.join(PUBLIC_DIR, publicPath)
  await mkdir(path.dirname(file), { recursive: true })
  const buffer = await sharp(Buffer.from(svg)).webp({ quality, effort: 5 }).toBuffer()
  await writeFile(file, buffer)
}

function art(product: SeedProduct, index = 0): ArtInput {
  const v = product.variants[index] ?? product.variants[0]!
  return { kind: product.art, color: v.hex, metal: v.metal, accent: v.accent }
}

function find(sku: string): SeedProduct {
  const p = products.find((x) => x.sku === sku)
  if (!p) throw new Error(`Unknown product ${sku}`)
  return p
}

async function productImages(): Promise<number> {
  let count = 0
  for (const product of products) {
    const smallWatch = product.gender === 'WOMEN'
    const seen = new Set<string>()
    for (const variant of product.variants) {
      const key = colorKey(variant)
      if (seen.has(key)) continue
      seen.add(key)
      await writeWebp(
        variantImagePath(product, variant),
        renderProductSvg({ kind: product.art, color: variant.hex, metal: variant.metal, accent: variant.accent }, { ...PRODUCT_IMAGE_SIZE, smallWatch }),
      )
      count++
    }
    // Alternate "detail" shot: closer crop, warmer backdrop, slight turn — used as the hover image.
    await writeWebp(
      detailImagePath(product),
      renderProductSvg(art(product), {
        ...PRODUCT_IMAGE_SIZE,
        smallWatch,
        backdrop: ['#efe6da', '#d9ccba'],
        scale: 1.38,
        rotate: -5,
        offsetY: -40,
      }),
    )
    count++
  }
  return count
}

const plinths = (items: Array<{ x: number; y: number; w: number; h: number; tone: string }>) =>
  items
    .map(
      (p) =>
        `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${p.tone}"/><rect x="${p.x}" y="${p.y}" width="${p.w}" height="14" fill="#ffffff" opacity="0.35"/><rect x="${p.x + p.w - 40}" y="${p.y}" width="40" height="${p.h}" fill="${darken(p.tone, 0.08)}"/>`,
    )
    .join('')

async function editorialImages(): Promise<number> {
  const luna = find('VLR-BAG-LUNA')
  const elan = find('VLR-WCH-ELAN')
  const lumiere = find('VLR-SUN-LUMIERE')
  const hilal = find('VLR-JWL-HILAL')
  const monaco = find('VLR-WCH-MONACO')
  const atlas = find('VLR-WLT-ATLAS')
  const falcon = find('VLR-SUN-FALCON')
  const sienna = find('VLR-BAG-SIENNA')
  const noir = find('VLR-BAG-NOIR')
  const aurelia = find('VLR-BAG-AURELIA')
  const yasmin = find('VLR-JWL-YASMIN')
  const noble = find('VLR-BLT-NOBLE')
  const rima = find('VLR-WLT-RIMA')
  const amara = find('VLR-BAG-AMARA')
  const layla = find('VLR-BAG-LAYLA')
  const riviera = find('VLR-WCH-RIVIERA')
  const charm = find('VLR-JWL-CHARM')
  const sultan = find('VLR-JWL-SULTAN')

  const scenes: Array<{ file: string; width: number; height: number; placements: Placement[]; backdrop?: [string, string]; extras?: string }> = [
    {
      file: '/images/editorial/hero-desktop.webp',
      width: 2400,
      height: 1350,
      backdrop: ['#f3ece2', '#dccfbd'],
      extras: plinths([
        { x: 1180, y: 1000, w: 560, h: 350, tone: '#e6dccd' },
        { x: 1700, y: 1110, w: 480, h: 240, tone: '#ddd1c0' },
        { x: 860, y: 1160, w: 380, h: 190, tone: '#e9e1d4' },
      ]),
      placements: [
        // y chosen so each product's floor-contact point lands on its plinth top.
        { input: art(luna, 0), x: 1460, y: 766, scale: 0.9 },
        { input: art(elan, 0), x: 1950, y: 888, scale: 0.46, rotate: 8, smallWatch: true },
        { input: art(lumiere, 0), x: 1050, y: 1072, scale: 0.42, rotate: -6 },
      ],
    },
    {
      file: '/images/editorial/hero-mobile.webp',
      width: 1080,
      height: 1350,
      backdrop: ['#f3ece2', '#dccfbd'],
      extras: plinths([{ x: 180, y: 1050, w: 720, h: 300, tone: '#e6dccd' }]),
      placements: [
        { input: art(luna, 0), x: 520, y: 836, scale: 0.82 },
        { input: art(elan, 0), x: 860, y: 878, scale: 0.36, rotate: 10, smallWatch: true },
      ],
    },
    {
      file: '/images/categories/women.webp',
      width: 1200,
      height: 1500,
      backdrop: ['#f5e9e4', '#e3cfc6'],
      placements: [
        { input: art(aurelia, 0), x: 560, y: 740, scale: 0.9 },
        { input: art(hilal, 0), x: 860, y: 1180, scale: 0.42 },
        { input: art(yasmin, 0), x: 300, y: 1180, scale: 0.36, rotate: -10 },
      ],
    },
    {
      file: '/images/categories/men.webp',
      width: 1200,
      height: 1500,
      backdrop: ['#eceae6', '#d3d0c9'],
      placements: [
        { input: art(monaco, 0), x: 600, y: 700, scale: 0.72 },
        { input: art(atlas, 0), x: 330, y: 1200, scale: 0.46 },
        { input: art(falcon, 0), x: 870, y: 1210, scale: 0.4 },
      ],
    },
    {
      file: '/images/categories/bags.webp',
      width: 1200,
      height: 1500,
      backdrop: ['#f3ece2', '#e0d4c3'],
      placements: [
        { input: art(sienna, 0), x: 470, y: 760, scale: 0.84 },
        { input: art(noir, 1), x: 840, y: 1000, scale: 0.6 },
      ],
    },
    {
      file: '/images/categories/watches.webp',
      width: 1200,
      height: 1500,
      backdrop: ['#efebe5', '#d9d2c7'],
      placements: [
        { input: art(monaco, 1), x: 440, y: 760, scale: 0.8 },
        { input: art(elan, 0), x: 850, y: 840, scale: 0.62, smallWatch: true },
      ],
    },
    {
      file: '/images/categories/accessories.webp',
      width: 1200,
      height: 1500,
      backdrop: ['#f1ece4', '#dcd2c3'],
      placements: [
        { input: art(lumiere, 1), x: 600, y: 560, scale: 0.62 },
        { input: art(noble, 2), x: 600, y: 960, scale: 0.62 },
        { input: art(rima, 1), x: 600, y: 1260, scale: 0.46 },
      ],
    },
    { file: '/images/categories/wallets.webp', width: 1200, height: 1500, placements: [{ input: art(atlas, 1), x: 600, y: 780, scale: 1 }] },
    { file: '/images/categories/belts.webp', width: 1200, height: 1500, placements: [{ input: art(noble, 0), x: 600, y: 780, scale: 1 }] },
    { file: '/images/categories/sunglasses.webp', width: 1200, height: 1500, placements: [{ input: art(falcon, 0), x: 600, y: 780, scale: 1 }] },
    {
      file: '/images/categories/jewellery.webp',
      width: 1200,
      height: 1500,
      placements: [
        { input: art(hilal, 0), x: 600, y: 700, scale: 0.8 },
        { input: art(sultan, 0), x: 600, y: 1150, scale: 0.5 },
      ],
    },
    {
      file: '/images/editorial/brand-story.webp',
      width: 1200,
      height: 1500,
      backdrop: ['#2a2622', '#171513'],
      placements: [{ input: art(luna, 1), x: 600, y: 760, scale: 1.02 }],
    },
    {
      file: '/images/editorial/promo-offers.webp',
      width: 1600,
      height: 1000,
      backdrop: ['#efe5d8', '#d8c7b1'],
      placements: [
        { input: art(layla, 0), x: 560, y: 560, scale: 0.72 },
        { input: art(riviera, 0), x: 1110, y: 580, scale: 0.5 },
      ],
    },
    {
      file: '/images/editorial/promo-new.webp',
      width: 1600,
      height: 1000,
      backdrop: ['#e8ece6', '#cdd3c8'],
      placements: [
        { input: art(amara, 1), x: 620, y: 560, scale: 0.72 },
        { input: art(charm, 1), x: 1080, y: 560, scale: 0.55 },
      ],
    },
    {
      file: '/images/editorial/promo-watches.webp',
      width: 1600,
      height: 1000,
      backdrop: ['#1f2a36', '#121820'],
      placements: [
        { input: art(riviera, 1), x: 620, y: 520, scale: 0.6 },
        { input: art(monaco, 0), x: 1040, y: 560, scale: 0.55 },
      ],
    },
  ]

  const gallery: Array<[SeedProduct, number, [string, string], number?]> = [
    [luna, 1, ['#f2ddd6', '#dcbcb1']],
    [monaco, 1, ['#27313d', '#151b22'], 0.9],
    [lumiere, 0, ['#efe3cf', '#d9c4a3']],
    [yasmin, 1, ['#dfe3d6', '#c3c9b6']],
    [amara, 1, ['#f4efe7', '#e3d9cb']],
    [charm, 1, ['#ead5c6', '#cfae99']],
  ]
  gallery.forEach(([product, variant, bg, scale], i) => {
    scenes.push({
      file: `/images/gallery/look-${i + 1}.webp`,
      width: 1080,
      height: 1080,
      backdrop: bg,
      placements: [
        { input: art(product, variant), x: 540, y: 560, scale: scale ?? 0.78, smallWatch: product.gender === 'WOMEN' },
      ],
    })
  })

  for (const scene of scenes) {
    await writeWebp(scene.file, renderScene(scene.placements, scene), 82)
  }
  return scenes.length
}

const productCount = await productImages()
const editorialCount = await editorialImages()
console.log(`generated ${productCount} product images and ${editorialCount} editorial images`)
