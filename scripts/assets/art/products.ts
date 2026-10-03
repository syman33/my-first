/**
 * Parametric product illustrations (SVG) for the demo catalogue.
 * Studio "sweep" backdrop, soft floor shadow, leather gradients, stitching
 * and metal hardware. Output is deterministic for a given input.
 */
import type { ArtKind } from '../../../prisma/seed/data/catalog'
import { darken, lighten, luminance, METALS, type MetalName, mix } from './color'

export interface ArtInput {
  kind: ArtKind
  color: string
  metal: MetalName
  accent?: string
}

export interface SceneOptions {
  width?: number
  height?: number
  /** Backdrop [top, bottom] colours. */
  backdrop?: [string, string]
  /** Rotation of the product in degrees (alternate shots). */
  rotate?: number
  scale?: number
  offsetX?: number
  offsetY?: number
}

interface Ctx {
  c: string // base colour
  hi: string
  lo: string
  stitch: string
  m: readonly [string, string, string]
  accent: string
}

function ctxFor(input: ArtInput): Ctx {
  const isDark = luminance(input.color) < 0.05
  return {
    c: input.color,
    hi: lighten(input.color, isDark ? 0.14 : 0.2),
    lo: darken(input.color, isDark ? 0.35 : 0.24),
    stitch: isDark ? lighten(input.color, 0.32) : darken(input.color, 0.3),
    m: METALS[input.metal],
    accent: input.accent ?? darken(input.color, 0.45),
  }
}

function defs(ctx: Ctx): string {
  const [mh, mm, ml] = ctx.m
  return `<defs>
  <linearGradient id="leather" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${ctx.hi}"/><stop offset="0.5" stop-color="${ctx.c}"/><stop offset="1" stop-color="${ctx.lo}"/>
  </linearGradient>
  <linearGradient id="leatherV" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${ctx.hi}"/><stop offset="0.55" stop-color="${ctx.c}"/><stop offset="1" stop-color="${ctx.lo}"/>
  </linearGradient>
  <linearGradient id="leatherSide" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${darken(ctx.c, 0.18)}"/><stop offset="0.5" stop-color="${ctx.c}"/><stop offset="1" stop-color="${darken(ctx.c, 0.28)}"/>
  </linearGradient>
  <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${mh}"/><stop offset="0.45" stop-color="${mm}"/><stop offset="0.7" stop-color="${mh}"/><stop offset="1" stop-color="${ml}"/>
  </linearGradient>
  <linearGradient id="metalV" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${mh}"/><stop offset="0.5" stop-color="${mm}"/><stop offset="1" stop-color="${ml}"/>
  </linearGradient>
  <radialGradient id="dial" cx="0.42" cy="0.38" r="0.75">
    <stop offset="0" stop-color="${lighten(ctx.accent, 0.28)}"/><stop offset="0.6" stop-color="${ctx.accent}"/><stop offset="1" stop-color="${darken(ctx.accent, 0.25)}"/>
  </radialGradient>
  <linearGradient id="lens" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${darken(ctx.accent, 0.35)}" stop-opacity="0.96"/><stop offset="1" stop-color="${lighten(ctx.accent, 0.3)}" stop-opacity="0.82"/>
  </linearGradient>
  <radialGradient id="sheen" cx="0.3" cy="0.2" r="0.7">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.28"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </radialGradient>
  <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="26"/></filter>
  <filter id="blurSm" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
</defs>`
}

function backdrop(w: number, h: number, top: string, bottom: string): string {
  const horizon = Math.round(h * 0.74)
  return `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${top}"/><stop offset="${(horizon / h).toFixed(3)}" stop-color="${mix(top, bottom, 0.55)}"/><stop offset="1" stop-color="${bottom}"/>
  </linearGradient>
  <radialGradient id="spot" cx="0.5" cy="0.28" r="0.62">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </radialGradient>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#spot)"/>`
}

const floor = (cx: number, cy: number, rx: number, ry: number, opacity = 0.28) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#2a2118" opacity="${opacity}" filter="url(#blur)"/>`

const stitch = (d: string, ctx: Ctx, width = 2.6) =>
  `<path d="${d}" fill="none" stroke="${ctx.stitch}" stroke-width="${width}" stroke-dasharray="9 7" stroke-linecap="round" opacity="0.7"/>`

/** Rounded-rectangle path. */
function rr(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`
}

/** Trapezoid with rounded corners: top width tw, bottom width bw, centred on cx. */
function trap(cx: number, y1: number, y2: number, tw: number, bw: number, r: number): string {
  const tl = cx - tw / 2
  const tr = cx + tw / 2
  const bl = cx - bw / 2
  const br = cx + bw / 2
  return `M${tl + r} ${y1}H${tr - r}Q${tr} ${y1} ${tr + (br - tr) * (r / (y2 - y1))} ${y1 + r}L${br - (br - tr) * (r / (y2 - y1))} ${y2 - r}Q${br} ${y2} ${br - r} ${y2}H${bl + r}Q${bl} ${y2} ${bl + (tl - bl) * (r / (y2 - y1))} ${y2 - r}L${tl - (tl - bl) * (r / (y2 - y1))} ${y1 + r}Q${tl} ${y1} ${tl + r} ${y1}Z`
}

/** The VÉLORA "V" clasp plate. */
function vClasp(cx: number, cy: number, w: number, h: number, ctx: Ctx): string {
  const x = cx - w / 2
  const y = cy - h / 2
  return `<g>
    <path d="${rr(x, y, w, h, h * 0.22)}" fill="url(#metal)" stroke="${ctx.m[2]}" stroke-width="1.5"/>
    <path d="M${cx - w * 0.2} ${cy - h * 0.24}L${cx} ${cy + h * 0.26}L${cx + w * 0.2} ${cy - h * 0.24}" fill="none" stroke="${ctx.m[2]}" stroke-width="${Math.max(2.5, h * 0.09)}" stroke-linejoin="round" stroke-linecap="round" opacity="0.8"/>
  </g>`
}

function sheenOver(d: string): string {
  return `<path d="${d}" fill="url(#sheen)"/>`
}

// ---------------------------------------------------------------- Bags

function bagShoulder(ctx: Ctx): string {
  const body = trap(600, 640, 1040, 440, 540, 44)
  const flap = `M392 652Q392 640 404 640H796Q808 640 808 652L842 860Q600 950 358 860Z`
  return `${floor(600, 1070, 300, 34)}
  <path d="M410 660C392 330 808 330 790 660" fill="none" stroke="${ctx.lo}" stroke-width="24" stroke-linecap="round"/>
  <path d="M410 660C392 330 808 330 790 660" fill="none" stroke="${ctx.hi}" stroke-width="6" stroke-linecap="round" opacity="0.35"/>
  <path d="${body}" fill="url(#leather)"/>
  ${stitch(trap(600, 662, 1018, 408, 506, 34), ctx)}
  <path d="${flap}" fill="url(#leatherV)" stroke="${ctx.lo}" stroke-width="2"/>
  ${stitch('M404 664H796L824 848Q600 926 376 848Z', ctx)}
  ${sheenOver(flap)}
  <path d="M358 860Q600 950 842 860" fill="none" stroke="${darken(ctx.c, 0.4)}" stroke-width="3" opacity="0.45"/>
  ${vClasp(600, 900, 92, 58, ctx)}`
}

function bagMini(ctx: Ctx): string {
  const links: string[] = []
  for (let i = 0; i <= 26; i++) {
    const t = i / 26
    const x = 430 + (770 - 430) * t
    const y = 700 - Math.sin(Math.PI * t) * 360
    links.push(
      `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="11" ry="7" fill="none" stroke="url(#metal)" stroke-width="5" transform="rotate(${(Math.cos(Math.PI * t) * -60).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`,
    )
  }
  const body = rr(410, 700, 380, 320, 46)
  return `${floor(600, 1045, 240, 28)}
  ${links.join('')}
  <path d="M500 712C500 560 700 560 700 712" fill="none" stroke="${ctx.lo}" stroke-width="30" stroke-linecap="round"/>
  <path d="M500 712C500 560 700 560 700 712" fill="none" stroke="${ctx.hi}" stroke-width="8" stroke-linecap="round" opacity="0.35"/>
  <path d="${body}" fill="url(#leather)"/>
  ${stitch(rr(430, 720, 340, 280, 34), ctx)}
  <path d="M410 760Q410 700 470 700H730Q790 700 790 760V860Q600 900 410 860Z" fill="url(#leatherV)" stroke="${ctx.lo}" stroke-width="2"/>
  ${sheenOver(body)}
  ${vClasp(600, 880, 76, 48, ctx)}`
}

function bagCrossbody(ctx: Ctx): string {
  const body = rr(360, 690, 480, 330, 30)
  return `${floor(600, 1048, 290, 30)}
  <path d="M380 710L250 180" stroke="${ctx.lo}" stroke-width="18" stroke-linecap="round"/>
  <path d="M820 710L950 180" stroke="${ctx.lo}" stroke-width="18" stroke-linecap="round"/>
  <path d="${body}" fill="url(#leather)"/>
  ${stitch(rr(378, 708, 444, 294, 22), ctx)}
  <path d="M360 720Q360 690 390 690H810Q840 690 840 720V900H360Z" fill="url(#leatherV)" stroke="${ctx.lo}" stroke-width="2"/>
  <path d="M360 900H840" stroke="${darken(ctx.c, 0.45)}" stroke-width="3" opacity="0.5"/>
  ${sheenOver(body)}
  <rect x="560" y="880" width="80" height="22" rx="8" fill="url(#metal)" stroke="${ctx.m[2]}" stroke-width="1.5"/>`
}

function bagTote(ctx: Ctx): string {
  const body = trap(600, 600, 1080, 600, 500, 30)
  return `${floor(600, 1100, 320, 36)}
  <path d="M430 612C430 330 540 330 540 612" fill="none" stroke="${ctx.lo}" stroke-width="26" stroke-linecap="round"/>
  <path d="M660 612C660 330 770 330 770 612" fill="none" stroke="${ctx.lo}" stroke-width="26" stroke-linecap="round"/>
  <path d="M430 612C430 330 540 330 540 612" fill="none" stroke="${ctx.hi}" stroke-width="6" stroke-linecap="round" opacity="0.3"/>
  <path d="M660 612C660 330 770 330 770 612" fill="none" stroke="${ctx.hi}" stroke-width="6" stroke-linecap="round" opacity="0.3"/>
  <path d="M310 600H890L884 628H316Z" fill="${ctx.accent}"/>
  <path d="${body}" fill="url(#leather)"/>
  ${stitch(trap(600, 640, 1054, 560, 468, 22), ctx)}
  <path d="M420 600L412 640M540 600L538 640M660 600L662 640M780 600L788 640" stroke="${ctx.lo}" stroke-width="30" stroke-linecap="round"/>
  <circle cx="416" cy="640" r="7" fill="url(#metal)"/><circle cx="539" cy="640" r="7" fill="url(#metal)"/>
  <circle cx="661" cy="640" r="7" fill="url(#metal)"/><circle cx="784" cy="640" r="7" fill="url(#metal)"/>
  ${sheenOver(body)}
  ${vClasp(600, 760, 70, 44, ctx)}`
}

function bagClutch(ctx: Ctx): string {
  const body = rr(320, 760, 560, 280, 22)
  const flap = 'M320 790Q320 760 350 760H850Q880 760 880 790L612 948Q600 956 588 948Z'
  return `${floor(600, 1062, 320, 28)}
  <path d="${body}" fill="url(#leather)"/>
  ${stitch(rr(338, 778, 524, 244, 14), ctx)}
  <path d="${flap}" fill="url(#leatherV)" stroke="${ctx.lo}" stroke-width="2"/>
  ${stitch('M352 782H848L606 928Q600 932 594 928Z', ctx)}
  ${sheenOver(flap)}
  ${sheenOver(body)}
  ${vClasp(600, 936, 62, 40, ctx)}`
}

function bagBucket(ctx: Ctx): string {
  return `${floor(600, 1080, 250, 34)}
  <path d="M430 640C430 380 770 380 770 640" fill="none" stroke="${ctx.lo}" stroke-width="22" stroke-linecap="round"/>
  <path d="M400 650Q396 1010 460 1050Q600 1090 740 1050Q804 1010 800 650Z" fill="url(#leatherSide)"/>
  <ellipse cx="600" cy="650" rx="200" ry="46" fill="${darken(ctx.c, 0.5)}"/>
  <ellipse cx="600" cy="644" rx="200" ry="40" fill="none" stroke="${ctx.hi}" stroke-width="10"/>
  <path d="M410 690Q600 740 790 690" fill="none" stroke="${ctx.lo}" stroke-width="7" stroke-dasharray="22 14"/>
  ${stitch('M430 720Q426 990 474 1024Q600 1060 726 1024Q774 990 770 720', ctx)}
  <path d="M600 712V800" stroke="${ctx.lo}" stroke-width="6"/>
  <circle cx="584" cy="812" r="9" fill="url(#metal)"/><circle cx="616" cy="812" r="9" fill="url(#metal)"/>
  <path d="M584 820L570 880M616 820L630 880" stroke="${ctx.lo}" stroke-width="5" stroke-linecap="round"/>
  <path d="M400 650Q396 1010 460 1050Q600 1090 740 1050Q804 1010 800 650Z" fill="url(#sheen)"/>`
}

function bagTopHandle(ctx: Ctx): string {
  const body = trap(600, 660, 1040, 460, 540, 26)
  return `${floor(600, 1064, 300, 32)}
  <path d="M470 668C470 450 730 450 730 668" fill="none" stroke="${ctx.lo}" stroke-width="44" stroke-linecap="round"/>
  <path d="M470 668C470 450 730 450 730 668" fill="none" stroke="${ctx.hi}" stroke-width="12" stroke-linecap="round" opacity="0.28"/>
  <rect x="452" y="648" width="36" height="36" rx="6" fill="url(#metal)"/><rect x="712" y="648" width="36" height="36" rx="6" fill="url(#metal)"/>
  <path d="${body}" fill="url(#leather)"/>
  <path d="M380 700H820L832 880Q600 924 368 880Z" fill="url(#leatherV)" stroke="${ctx.lo}" stroke-width="2"/>
  ${stitch('M392 716H808L816 866Q600 906 384 866Z', ctx)}
  ${stitch(trap(600, 688, 1020, 432, 508, 18), ctx, 2)}
  ${sheenOver(body)}
  <rect x="565" y="872" width="70" height="56" rx="12" fill="url(#metal)" stroke="${ctx.m[2]}" stroke-width="1.5"/>
  <rect x="590" y="884" width="20" height="32" rx="10" fill="${ctx.m[2]}" opacity="0.55"/>`
}

function bagHobo(ctx: Ctx): string {
  const body = 'M330 700Q340 1060 600 1070Q860 1060 870 700Q790 760 600 760Q410 760 330 700Z'
  return `${floor(600, 1090, 300, 34)}
  <path d="M340 706Q330 330 600 330Q870 330 860 706" fill="none" stroke="${ctx.lo}" stroke-width="40" stroke-linecap="round"/>
  <path d="M340 706Q330 330 600 330Q870 330 860 706" fill="none" stroke="${ctx.hi}" stroke-width="10" stroke-linecap="round" opacity="0.3"/>
  <path d="${body}" fill="url(#leather)"/>
  <path d="M380 740Q420 960 600 1000Q780 960 820 740" fill="none" stroke="${ctx.lo}" stroke-width="3" opacity="0.4"/>
  ${stitch('M352 722Q364 1036 600 1046Q836 1036 848 722', ctx)}
  ${sheenOver(body)}
  <path d="M540 770H660" stroke="url(#metal)" stroke-width="8" stroke-linecap="round"/>`
}

function bagWeekender(ctx: Ctx): string {
  const body = rr(240, 720, 720, 330, 150)
  return `${floor(600, 1082, 400, 38)}
  <path d="M430 730C430 520 560 520 560 730" fill="none" stroke="${ctx.accent}" stroke-width="30" stroke-linecap="round"/>
  <path d="M640 730C640 520 770 520 770 730" fill="none" stroke="${ctx.accent}" stroke-width="30" stroke-linecap="round"/>
  <path d="${body}" fill="url(#leather)"/>
  <path d="M300 736Q600 706 900 736" fill="none" stroke="url(#metal)" stroke-width="7" stroke-dasharray="4 4"/>
  <rect x="300" y="800" width="120" height="200" rx="40" fill="${ctx.accent}" opacity="0.92"/>
  <rect x="780" y="800" width="120" height="200" rx="40" fill="${ctx.accent}" opacity="0.92"/>
  ${stitch(rr(262, 742, 676, 286, 130), ctx)}
  <rect x="416" y="712" width="30" height="40" rx="6" fill="url(#metal)"/><rect x="754" y="712" width="30" height="40" rx="6" fill="url(#metal)"/>
  ${sheenOver(body)}
  <path d="M886 736L912 790" stroke="url(#metal)" stroke-width="8" stroke-linecap="round"/>`
}

function bagMessenger(ctx: Ctx): string {
  const body = rr(290, 640, 620, 440, 26)
  return `${floor(600, 1104, 360, 36)}
  <path d="M300 660L180 150M900 660L1020 150" stroke="${ctx.lo}" stroke-width="30" stroke-linecap="round"/>
  <path d="${body}" fill="url(#leather)"/>
  <path d="M290 670Q290 640 320 640H880Q910 640 910 670V960H290Z" fill="url(#leatherV)" stroke="${ctx.lo}" stroke-width="2"/>
  ${stitch('M310 660H890V944H310Z', ctx)}
  <rect x="420" y="760" width="40" height="230" rx="8" fill="${ctx.lo}"/><rect x="740" y="760" width="40" height="230" rx="8" fill="${ctx.lo}"/>
  <rect x="408" y="912" width="64" height="44" rx="8" fill="none" stroke="url(#metal)" stroke-width="8"/>
  <rect x="728" y="912" width="64" height="44" rx="8" fill="none" stroke="url(#metal)" stroke-width="8"/>
  ${sheenOver(body)}`
}

// ---------------------------------------------------------------- Watches

function watchHead(
  ctx: Ctx,
  cx: number,
  cy: number,
  r: number,
  opts: { chrono?: boolean; minimal?: boolean; date?: boolean },
): string {
  const ticks: string[] = []
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const major = i % 3 === 0
    const r1 = r * (opts.minimal ? 0.74 : 0.7)
    const r2 = r * (major ? 0.56 : 0.62)
    if (opts.minimal && !major) continue
    ticks.push(
      `<line x1="${(cx + Math.sin(a) * r1).toFixed(1)}" y1="${(cy - Math.cos(a) * r1).toFixed(1)}" x2="${(cx + Math.sin(a) * r2).toFixed(1)}" y2="${(cy - Math.cos(a) * r2).toFixed(1)}" stroke="url(#metal)" stroke-width="${major ? 10 : 6}" stroke-linecap="round"/>`,
    )
  }
  const bezelTicks: string[] = []
  if (opts.chrono) {
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2
      bezelTicks.push(
        `<line x1="${(cx + Math.sin(a) * r * 0.97).toFixed(1)}" y1="${(cy - Math.cos(a) * r * 0.97).toFixed(1)}" x2="${(cx + Math.sin(a) * r * (i % 5 === 0 ? 0.87 : 0.91)).toFixed(1)}" y2="${(cy - Math.cos(a) * r * (i % 5 === 0 ? 0.87 : 0.91)).toFixed(1)}" stroke="${darken(ctx.m[2], 0.4)}" stroke-width="2"/>`,
      )
    }
  }
  const sub = (x: number, y: number) =>
    `<circle cx="${x}" cy="${y}" r="${r * 0.17}" fill="${darken(ctx.accent, 0.2)}" stroke="url(#metal)" stroke-width="3"/><line x1="${x}" y1="${y}" x2="${x + r * 0.1}" y2="${y - r * 0.08}" stroke="${ctx.m[0]}" stroke-width="3" stroke-linecap="round"/>`
  const hand = (angleDeg: number, length: number, width: number, color: string) => {
    const a = (angleDeg * Math.PI) / 180
    const x = cx + Math.sin(a) * length
    const y = cy - Math.cos(a) * length
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`
  }
  const dialInner = opts.chrono ? r * 0.84 : r * 0.9
  return `<g>
    <circle cx="${cx}" cy="${cy + 8}" r="${r}" fill="#000" opacity="0.25" filter="url(#blurSm)"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#metal)"/>
    ${bezelTicks.join('')}
    <circle cx="${cx}" cy="${cy}" r="${dialInner}" fill="url(#dial)" stroke="${ctx.m[2]}" stroke-width="2"/>
    ${ticks.join('')}
    ${opts.chrono ? sub(cx - r * 0.42, cy) + sub(cx + r * 0.42, cy) + sub(cx, cy + r * 0.42) : ''}
    ${opts.date ? `<rect x="${cx - r * 0.09}" y="${cy + r * 0.34}" width="${r * 0.18}" height="${r * 0.14}" rx="3" fill="#f6f2ea" stroke="url(#metal)" stroke-width="2"/>` : ''}
    <path d="M${cx - r * 0.06} ${cy - r * 0.46}L${cx} ${cy - r * 0.36}L${cx + r * 0.06} ${cy - r * 0.46}" fill="none" stroke="url(#metal)" stroke-width="3.5" stroke-linejoin="round"/>
    ${hand(-60, r * 0.42, 11, ctx.m[1])}
    ${hand(60, r * 0.62, 8, ctx.m[1])}
    ${opts.minimal ? '' : hand(150, r * 0.7, 3, '#b89b72')}
    <circle cx="${cx}" cy="${cy}" r="11" fill="url(#metal)" stroke="${ctx.m[2]}" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy}" r="${dialInner}" fill="url(#sheen)"/>
    <rect x="${cx + r - 4}" y="${cy - 18}" width="30" height="36" rx="8" fill="url(#metalV)"/>
    ${opts.chrono ? `<rect x="${cx + r * 0.72}" y="${cy - r * 0.78}" width="26" height="30" rx="7" fill="url(#metalV)" transform="rotate(40 ${cx + r * 0.72} ${cy - r * 0.78})"/><rect x="${cx + r * 0.78}" y="${cy + r * 0.62}" width="26" height="30" rx="7" fill="url(#metalV)" transform="rotate(-40 ${cx + r * 0.78} ${cy + r * 0.62})"/>` : ''}
  </g>`
}

function leatherStrap(
  ctx: Ctx,
  cx: number,
  top: number,
  bottom: number,
  width: number,
  holes: boolean,
): string {
  const holeMarks = holes
    ? Array.from(
        { length: 5 },
        (_, i) =>
          `<circle cx="${cx}" cy="${bottom - 70 - i * 44}" r="6" fill="${darken(ctx.c, 0.5)}"/>`,
      ).join('')
    : ''
  return `<path d="${rr(cx - width / 2, top, width, bottom - top, 22)}" fill="url(#leatherSide)"/>
  ${stitch(`M${cx - width / 2 + 12} ${top + 20}V${bottom - 20}M${cx + width / 2 - 12} ${top + 20}V${bottom - 20}`, ctx, 2)}
  ${holeMarks}`
}

function watchLeather(ctx: Ctx, small: boolean): string {
  const r = small ? 170 : 200
  return `${floor(600, 1240, 180, 26, 0.22)}
  ${leatherStrap(ctx, 600, 130, 640, small ? 120 : 150, false)}
  ${leatherStrap(ctx, 600, 860, 1260, small ? 120 : 150, true)}
  <rect x="${600 - (small ? 80 : 96)}" y="${760 - r - 20}" width="${small ? 160 : 192}" height="${r * 2 + 40}" rx="30" fill="url(#metalV)"/>
  ${watchHead(ctx, 600, 760, r, { date: !small })}`
}

function bracelet(_ctx: Ctx, cx: number, top: number, bottom: number, width: number): string {
  const rows: string[] = []
  for (let y = top; y < bottom; y += 46) {
    rows.push(
      `<rect x="${cx - width / 2}" y="${y}" width="${width * 0.3}" height="40" rx="10" fill="url(#metalV)"/>`,
      `<rect x="${cx - width * 0.18}" y="${y}" width="${width * 0.36}" height="40" rx="10" fill="url(#metal)"/>`,
      `<rect x="${cx + width * 0.2}" y="${y}" width="${width * 0.3}" height="40" rx="10" fill="url(#metalV)"/>`,
    )
  }
  return rows.join('')
}

function watchBracelet(ctx: Ctx): string {
  return `${floor(600, 1240, 170, 24, 0.22)}
  ${bracelet(ctx, 600, 150, 620, 130)}
  ${bracelet(ctx, 600, 900, 1260, 130)}
  ${watchHead(ctx, 600, 760, 160, {})}`
}

function watchChrono(ctx: Ctx): string {
  return `${floor(600, 1250, 200, 26, 0.22)}
  ${bracelet(ctx, 600, 120, 600, 170)}
  ${bracelet(ctx, 600, 930, 1280, 170)}
  <rect x="496" y="530" width="208" height="460" rx="36" fill="url(#metalV)"/>
  ${watchHead(ctx, 600, 760, 215, { chrono: true })}`
}

function watchMesh(ctx: Ctx): string {
  const mesh = (top: number, bottom: number) => {
    const lines: string[] = []
    for (let y = top; y < bottom; y += 7)
      lines.push(
        `<line x1="530" y1="${y}" x2="670" y2="${y + 5}" stroke="${ctx.m[2]}" stroke-width="1.4" opacity="0.55"/>`,
      )
    return `<rect x="530" y="${top}" width="140" height="${bottom - top}" rx="12" fill="url(#metalV)"/>${lines.join('')}`
  }
  return `${floor(600, 1240, 170, 24, 0.22)}
  ${mesh(130, 620)}
  ${mesh(900, 1270)}
  <rect x="562" y="1200" width="76" height="60" rx="10" fill="url(#metal)"/>
  ${watchHead(ctx, 600, 760, 190, { minimal: true })}`
}

// ---------------------------------------------------------------- Wallets

function cardEdges(
  x: number,
  y: number,
  w: number,
  count: number,
  gap: number,
  colors: string[],
): string {
  return Array.from(
    { length: count },
    (_, i) =>
      `<path d="${rr(x + i * 8, y + i * gap, w - i * 16, 60, 10)}" fill="${colors[i % colors.length]}"/>`,
  ).join('')
}

function walletBifold(ctx: Ctx): string {
  const left = rr(260, 620, 330, 400, 26)
  const right = rr(610, 620, 330, 400, 26)
  const cards = ['#e9e3d8', '#b89b72', '#2f3f5c', '#d8d4cc']
  return `${floor(600, 1050, 360, 30)}
  <path d="${left}" fill="url(#leather)"/><path d="${right}" fill="url(#leather)"/>
  ${cardEdges(290, 660, 270, 3, 44, cards)}
  ${cardEdges(640, 660, 270, 3, 44, [cards[2]!, cards[0]!, cards[1]!])}
  <path d="M276 760H574V1000H276Z" fill="url(#leatherV)"/><path d="M626 760H924V1000H626Z" fill="url(#leatherV)"/>
  <path d="M276 800H574M276 850H574M626 800H924M626 850H924" stroke="${ctx.lo}" stroke-width="3" opacity="0.6"/>
  ${stitch(rr(274, 634, 302, 372, 18), ctx, 2)}${stitch(rr(624, 634, 302, 372, 18), ctx, 2)}
  <rect x="588" y="620" width="24" height="400" fill="${ctx.lo}"/>
  ${sheenOver(left)}${sheenOver(right)}`
}

function walletCard(ctx: Ctx): string {
  const body = rr(390, 700, 420, 300, 30)
  return `${floor(600, 1030, 250, 26)}
  <path d="${body}" fill="url(#leather)"/>
  <path d="M410 790Q600 760 790 790" fill="none" stroke="${ctx.lo}" stroke-width="4"/>
  <path d="M410 860Q600 830 790 860" fill="none" stroke="${ctx.lo}" stroke-width="4"/>
  ${stitch(rr(408, 718, 384, 264, 20), ctx, 2)}
  <path d="M570 912L600 956L630 912" fill="none" stroke="${ctx.m[1]}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
  ${sheenOver(body)}`
}

function walletLong(ctx: Ctx): string {
  const body = rr(270, 700, 660, 330, 40)
  const teeth = Array.from(
    { length: 44 },
    (_, i) => `<rect x="${300 + i * 14}" y="${709}" width="7" height="9" fill="url(#metal)"/>`,
  ).join('')
  return `${floor(600, 1060, 360, 30)}
  <path d="${body}" fill="url(#leather)"/>
  ${teeth}
  <path d="M290 714V1004M910 714V1004" stroke="url(#metal)" stroke-width="7" stroke-dasharray="7 7"/>
  ${stitch(rr(292, 730, 616, 276, 28), ctx, 2)}
  <path d="M900 712L960 700" stroke="url(#metal)" stroke-width="8" stroke-linecap="round"/>
  <path d="M955 690L985 682L990 712L962 718Z" fill="url(#metal)"/>
  ${sheenOver(body)}
  ${vClasp(600, 870, 58, 36, ctx)}`
}

function walletTravel(ctx: Ctx): string {
  const body = rr(410, 460, 380, 620, 30)
  return `${floor(600, 1110, 240, 30)}
  <path d="${body}" fill="url(#leather)"/>
  ${stitch(rr(430, 480, 340, 580, 20), ctx)}
  <rect x="742" y="700" width="90" height="70" rx="14" fill="${ctx.lo}"/>
  <circle cx="800" cy="735" r="12" fill="url(#metal)"/>
  <path d="M500 640L600 760L700 640" fill="none" stroke="${ctx.m[1]}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>
  ${sheenOver(body)}`
}

// ---------------------------------------------------------------- Belts

/** A buckled belt standing as a loop, seen in perspective — the classic belt product shot. */
function beltLoop(ctx: Ctx, width: number, slim: boolean): string {
  const cx = 600
  const cy = 760
  const rx = 330
  const ry = 130
  const arc = (sweep: 0 | 1, r: { x: number; y: number }) =>
    `M${cx - r.x} ${cy}A${r.x} ${r.y} 0 0 ${sweep} ${cx + r.x} ${cy}`
  const buckleW = slim ? 104 : 136
  const buckleH = width + (slim ? 30 : 40)
  const bx = cx - 40
  const by = cy + ry - buckleH / 2
  const holes = Array.from({ length: 4 }, (_, i) => {
    const t = 0.18 + i * 0.07
    const angle = Math.PI / 2 - t * Math.PI
    return `<ellipse cx="${(cx + Math.cos(angle) * rx).toFixed(1)}" cy="${(cy + Math.sin(angle) * ry).toFixed(1)}" rx="6" ry="${slim ? 4 : 5}" fill="${darken(ctx.c, 0.55)}"/>`
  }).join('')
  return `${floor(cx, cy + ry + 70, 380, 34, 0.24)}
  <path d="${arc(1, { x: rx, y: ry })}" fill="none" stroke="${darken(ctx.c, 0.3)}" stroke-width="${width}"/>
  <path d="${arc(1, { x: rx - width / 2 + 7, y: ry - width / 2 + 7 })}" fill="none" stroke="${ctx.stitch}" stroke-width="2" stroke-dasharray="9 7" opacity="0.4"/>
  <path d="${arc(0, { x: rx, y: ry })}" fill="none" stroke="${ctx.lo}" stroke-width="${width + 6}"/>
  <path d="${arc(0, { x: rx, y: ry })}" fill="none" stroke="url(#leatherV)" stroke-width="${width}"/>
  <path d="${arc(0, { x: rx + width / 2 - 8, y: ry + width / 2 - 8 })}" fill="none" stroke="${ctx.stitch}" stroke-width="2.2" stroke-dasharray="9 7" opacity="0.65"/>
  <path d="${arc(0, { x: rx - width / 2 + 8, y: ry - width / 2 + 8 })}" fill="none" stroke="${ctx.stitch}" stroke-width="2.2" stroke-dasharray="9 7" opacity="0.65"/>
  ${holes}
  <rect x="${cx + 60}" y="${cy + ry - width / 2 - 6}" width="${slim ? 20 : 26}" height="${width + 12}" rx="6" fill="${ctx.lo}"/>
  <g>
    <rect x="${bx - buckleW / 2}" y="${by}" width="${buckleW}" height="${buckleH}" rx="${slim ? 16 : 22}" fill="none" stroke="url(#metal)" stroke-width="${slim ? 11 : 15}"/>
    <path d="M${bx - buckleW * 0.22} ${by + buckleH * 0.3}L${bx} ${by + buckleH * 0.72}L${bx + buckleW * 0.22} ${by + buckleH * 0.3}" fill="none" stroke="url(#metal)" stroke-width="${slim ? 7 : 9}" stroke-linejoin="round" stroke-linecap="round"/>
  </g>
  <path d="M${cx - rx + 40} ${cy + 40}Q${cx} ${cy + ry + 6} ${cx + rx - 40} ${cy + 40}" fill="none" stroke="#ffffff" stroke-width="5" opacity="0.14"/>`
}

function beltChain(_ctx: Ctx): string {
  const links: string[] = []
  for (let i = 0; i <= 30; i++) {
    const t = i / 30
    const x = 250 + 700 * t
    const y = 640 + Math.sin(Math.PI * t) * 320
    const angle = (Math.cos(Math.PI * t) * 42).toFixed(1)
    links.push(
      `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="20" ry="12" fill="none" stroke="url(#metal)" stroke-width="7" transform="rotate(${i % 2 ? angle : Number(angle) + 90} ${x.toFixed(1)} ${y.toFixed(1)})"/>`,
    )
  }
  return `${floor(600, 1070, 380, 30, 0.2)}
  ${links.join('')}
  <path d="M560 990L600 1060L640 990" fill="none" stroke="url(#metal)" stroke-width="14" stroke-linejoin="round" stroke-linecap="round"/>`
}

// ---------------------------------------------------------------- Sunglasses

function glasses(
  ctx: Ctx,
  lens: string,
  mirror: string,
  frameWidth: number,
  bridge: string,
  temples: string,
): string {
  return `${floor(600, 1000, 360, 24, 0.2)}
  <g>
    <path d="${lens}" fill="url(#lens)" stroke="${ctx.c}" stroke-width="${frameWidth}" stroke-linejoin="round"/>
    <path d="${mirror}" fill="url(#lens)" stroke="${ctx.c}" stroke-width="${frameWidth}" stroke-linejoin="round"/>
    <path d="${lens}" fill="url(#sheen)"/><path d="${mirror}" fill="url(#sheen)"/>
    ${bridge}
    ${temples}
  </g>`
}

function mirrorPath(d: string): string {
  // Mirror x around 600 for simple M/L/C/Q paths with absolute coordinates.
  return d.replace(
    /(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g,
    (_m, x: string, y: string) => `${(1200 - Number(x)).toFixed(1)} ${y}`,
  )
}

function sunCateye(ctx: Ctx): string {
  const lens =
    'M240 700 C 250 660, 330 640, 420 650 C 500 658, 560 680, 556 730 C 552 800, 480 850, 390 846 C 300 842, 250 790, 240 740 C 236 720, 230 700, 216 690 Z'
  return glasses(
    ctx,
    lens,
    mirrorPath(lens),
    26,
    `<path d="M556 712Q600 690 644 712" fill="none" stroke="${ctx.c}" stroke-width="20" stroke-linecap="round"/>`,
    `<path d="M226 694L196 684M974 694L1004 684" stroke="${ctx.c}" stroke-width="20" stroke-linecap="round"/>${vClasp(236, 700, 26, 18, ctx)}${vClasp(964, 700, 26, 18, ctx)}`,
  )
}

function sunAviator(ctx: Ctx): string {
  const lens =
    'M250 690 C 330 660, 470 662, 540 690 C 560 760, 530 850, 430 862 C 330 872, 262 810, 250 740 Z'
  return glasses(
    ctx,
    lens,
    mirrorPath(lens),
    9,
    `<path d="M540 690Q600 668 660 690M536 720Q600 704 664 720" fill="none" stroke="url(#metal)" stroke-width="8" stroke-linecap="round"/><ellipse cx="560" cy="780" rx="12" ry="18" fill="#ffffff" opacity="0.55"/><ellipse cx="640" cy="780" rx="12" ry="18" fill="#ffffff" opacity="0.55"/>`,
    `<path d="M252 694L210 690M948 694L990 690" stroke="url(#metal)" stroke-width="9" stroke-linecap="round"/>`,
  )
}

function sunRound(ctx: Ctx): string {
  const lens =
    'M400 620 C 490 620, 540 690, 540 760 C 540 840, 480 900, 400 900 C 320 900, 260 840, 260 760 C 260 690, 310 620, 400 620 Z'
  return glasses(
    ctx,
    lens,
    mirrorPath(lens),
    18,
    `<path d="M540 740Q560 700 600 700Q640 700 660 740" fill="none" stroke="url(#metal)" stroke-width="10" stroke-linecap="round"/>`,
    `<path d="M262 736L220 724M938 736L980 724" stroke="url(#metal)" stroke-width="10" stroke-linecap="round"/>`,
  )
}

function sunSquare(ctx: Ctx): string {
  const lens = rr(236, 640, 316, 240, 46)
  const mirror = rr(648, 640, 316, 240, 46)
  return glasses(
    ctx,
    lens,
    mirror,
    30,
    `<path d="M552 700Q600 680 648 700" fill="none" stroke="${ctx.c}" stroke-width="26" stroke-linecap="round"/>`,
    `<path d="M240 660L200 650M960 660L1000 650" stroke="${ctx.c}" stroke-width="26" stroke-linecap="round"/><rect x="226" y="650" width="22" height="10" rx="3" fill="url(#metal)"/><rect x="952" y="650" width="22" height="10" rx="3" fill="url(#metal)"/>`,
  )
}

// ---------------------------------------------------------------- Jewellery & small accessories

/** Open cuff bangle standing on its edge: back arc in shadow, front arc lit, crescent ends meeting at the front. */
function bangle(ctx: Ctx): string {
  const cx = 600
  const cy = 760
  const rx = 270
  const ry = 150
  const gap = 0.22 // radians either side of the front
  const pt = (a: number) =>
    `${(cx + Math.cos(a) * rx).toFixed(1)} ${(cy + Math.sin(a) * ry).toFixed(1)}`
  const front1 = Math.PI / 2 - gap
  const front2 = Math.PI / 2 + gap
  return `${floor(cx, cy + ry + 60, 320, 30, 0.22)}
  <path d="M${cx - rx} ${cy}A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}" fill="none" stroke="${ctx.m[2]}" stroke-width="40" stroke-linecap="round"/>
  <path d="M${cx - rx} ${cy}A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}" fill="none" stroke="url(#metalV)" stroke-width="34" opacity="0.55"/>
  <path d="M${cx + rx} ${cy}A${rx} ${ry} 0 0 1 ${pt(front1)}" fill="none" stroke="url(#metal)" stroke-width="46" stroke-linecap="round"/>
  <path d="M${pt(front2)}A${rx} ${ry} 0 0 1 ${cx - rx} ${cy}" fill="none" stroke="url(#metal)" stroke-width="46" stroke-linecap="round"/>
  <path d="M${cx + rx - 14} ${cy + 18}A${rx - 14} ${ry - 14} 0 0 1 ${pt(front1 + 0.02)}" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" opacity="0.5"/>
  <circle cx="${pt(front1).split(' ')[0]}" cy="${pt(front1).split(' ')[1]}" r="30" fill="url(#metal)" stroke="${ctx.m[2]}" stroke-width="2"/>
  <circle cx="${pt(front2).split(' ')[0]}" cy="${pt(front2).split(' ')[1]}" r="30" fill="url(#metal)" stroke="${ctx.m[2]}" stroke-width="2"/>`
}

function cufflinks(ctx: Ctx): string {
  const link = (x: number, y: number, rot: number) => `<g transform="rotate(${rot} ${x} ${y})">
    <rect x="${x - 115}" y="${y - 115 + 12}" width="230" height="230" rx="30" fill="#000" opacity="0.28" filter="url(#blurSm)"/>
    <rect x="${x - 115}" y="${y - 115}" width="230" height="230" rx="30" fill="url(#metal)"/>
    <rect x="${x - 80}" y="${y - 80}" width="160" height="160" rx="18" fill="${ctx.accent}"/>
    <rect x="${x - 80}" y="${y - 80}" width="160" height="160" rx="18" fill="url(#sheen)"/>
  </g>`
  return `${floor(600, 1010, 330, 28, 0.2)}${link(470, 760, -8)}${link(740, 820, 10)}`
}

function scarf(ctx: Ctx): string {
  const flowers: string[] = []
  const flower = (x: number, y: number, s: number) =>
    Array.from({ length: 5 }, (_, i) => {
      const a = (i / 5) * Math.PI * 2
      return `<ellipse cx="${(x + Math.cos(a) * s).toFixed(1)}" cy="${(y + Math.sin(a) * s).toFixed(1)}" rx="${s * 0.8}" ry="${s * 0.45}" fill="${ctx.accent}" opacity="0.85" transform="rotate(${((a * 180) / Math.PI).toFixed(1)} ${(x + Math.cos(a) * s).toFixed(1)} ${(y + Math.sin(a) * s).toFixed(1)})"/>`
    }).join('') + `<circle cx="${x}" cy="${y}" r="${s * 0.45}" fill="${lighten(ctx.accent, 0.4)}"/>`
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      flowers.push(flower(360 + col * 96 + (row % 2) * 48, 540 + row * 96, 16))
    }
  }
  const shape = 'M600 400L920 760L600 1100L280 760Z'
  return `${floor(600, 1110, 330, 30)}
  <clipPath id="scarfClip"><path d="${shape}"/></clipPath>
  <path d="${shape}" fill="url(#leather)"/>
  <g clip-path="url(#scarfClip)">${flowers.join('')}
    <path d="M280 760L920 760" stroke="${darken(ctx.c, 0.2)}" stroke-width="30" opacity="0.18"/>
    <path d="M600 400L600 1100" stroke="#ffffff" stroke-width="40" opacity="0.08"/>
  </g>
  <path d="${shape}" fill="none" stroke="${ctx.accent}" stroke-width="16" opacity="0.9"/>
  <path d="${shape}" fill="url(#sheen)"/>`
}

function charm(ctx: Ctx): string {
  const strands = Array.from({ length: 22 }, (_, i) => {
    const x = 540 + i * 5.7
    return `<path d="M${x.toFixed(1)} 880Q${(x + (i % 3) - 1).toFixed(1)} 1000 ${(x + (i - 11) * 1.6).toFixed(1)} 1120" stroke="${i % 4 === 0 ? ctx.hi : i % 2 ? ctx.c : ctx.lo}" stroke-width="5" stroke-linecap="round" fill="none"/>`
  }).join('')
  return `${floor(600, 1150, 200, 24, 0.2)}
  <circle cx="600" cy="430" r="70" fill="none" stroke="url(#metal)" stroke-width="16"/>
  <rect x="588" y="496" width="24" height="60" rx="8" fill="url(#metalV)"/>
  <path d="M470 560H730L600 800Z" fill="url(#metal)" stroke="${ctx.m[2]}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M520 590L600 740L680 590" fill="none" stroke="${ctx.m[2]}" stroke-width="10" stroke-linejoin="round" opacity="0.7"/>
  <rect x="560" y="800" width="80" height="90" rx="14" fill="url(#leatherV)"/>
  <rect x="560" y="840" width="80" height="12" fill="url(#metal)"/>
  ${strands}`
}

const DRAWERS: Record<ArtKind, (ctx: Ctx) => string> = {
  'bag-shoulder': bagShoulder,
  'bag-mini': bagMini,
  'bag-crossbody': bagCrossbody,
  'bag-tote': bagTote,
  'bag-clutch': bagClutch,
  'bag-bucket': bagBucket,
  'bag-top-handle': bagTopHandle,
  'bag-hobo': bagHobo,
  'bag-weekender': bagWeekender,
  'bag-messenger': bagMessenger,
  'watch-leather': (c) => watchLeather(c, false),
  'watch-bracelet': watchBracelet,
  'watch-chrono': watchChrono,
  'watch-mesh': watchMesh,
  'wallet-bifold': walletBifold,
  'wallet-card': walletCard,
  'wallet-long': walletLong,
  'wallet-travel': walletTravel,
  'belt-classic': (c) => beltLoop(c, 58, false),
  'belt-slim': (c) => beltLoop(c, 36, true),
  'belt-chain': beltChain,
  'sunglasses-cateye': sunCateye,
  'sunglasses-aviator': sunAviator,
  'sunglasses-round': sunRound,
  'sunglasses-square': sunSquare,
  bangle,
  cufflinks,
  scarf,
  charm,
}

/** Product artwork only (no backdrop), in the 1200×1500 design space. */
export function productArt(input: ArtInput, smallWatch = false): { defs: string; body: string } {
  const ctx = ctxFor(input)
  const body =
    input.kind === 'watch-leather' && smallWatch
      ? watchLeather(ctx, true)
      : DRAWERS[input.kind](ctx)
  return { defs: defs(ctx), body }
}

export const DEFAULT_BACKDROP: [string, string] = ['#f4efe7', '#e3d9cb']

export function renderProductSvg(
  input: ArtInput,
  options: SceneOptions & { smallWatch?: boolean } = {},
): string {
  const w = options.width ?? 1200
  const h = options.height ?? 1500
  const [top, bottom] = options.backdrop ?? DEFAULT_BACKDROP
  const { defs: d, body } = productArt(input, options.smallWatch)
  const scale = options.scale ?? 1
  const tx = (options.offsetX ?? 0) + (w - 1200 * scale) / 2
  const ty = (options.offsetY ?? 0) + (h - 1500 * scale) / 2
  const rotate = options.rotate ? ` rotate(${options.rotate} 600 780)` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  ${d}
  ${backdrop(w, h, top, bottom)}
  <g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scale})${rotate}">${body}</g>
</svg>`
}

/**
 * Prefix every id / url(#id) reference so several products (each with its own
 * colour gradients) can be composed in one SVG scene without collisions.
 */
export function namespaceIds(fragment: string, prefix: string): string {
  return fragment
    .replace(/id="([\w-]+)"/g, (_m, id: string) => `id="${prefix}-${id}"`)
    .replace(/url\(#([\w-]+)\)/g, (_m, id: string) => `url(#${prefix}-${id})`)
}

export interface Placement {
  input: ArtInput
  /** Centre of the product (design-space x=600, y=780) is moved here. */
  x: number
  y: number
  scale: number
  rotate?: number
  smallWatch?: boolean
}

/** Compose several products over a backdrop (editorial/hero imagery). */
export function renderScene(
  placements: Placement[],
  options: { width: number; height: number; backdrop?: [string, string]; extras?: string },
): string {
  const [top, bottom] = options.backdrop ?? DEFAULT_BACKDROP
  const groups = placements
    .map((p, i) => {
      const { defs: d, body } = productArt(p.input, p.smallWatch)
      const rotate = p.rotate ? ` rotate(${p.rotate} 600 780)` : ''
      return namespaceIds(
        `${d}<g transform="translate(${(p.x - 600 * p.scale).toFixed(1)} ${(p.y - 780 * p.scale).toFixed(1)}) scale(${p.scale})${rotate}">${body}</g>`,
        `p${i}`,
      )
    })
    .join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}">
  ${backdrop(options.width, options.height, top, bottom)}
  ${options.extras ?? ''}
  ${groups}
</svg>`
}
