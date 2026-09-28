/** Small colour helpers for the illustration generator. */

export interface Rgb {
  r: number
  g: number
  b: number
}

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '')
  const n = Number.parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  return rgbToHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t })
}

export const lighten = (hex: string, t: number) => mix(hex, '#ffffff', t)
export const darken = (hex: string, t: number) => mix(hex, '#000000', t)

export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Metal finishes: [highlight, mid, shadow]. */
export const METALS = {
  gold: ['#f6e3ae', '#caa55e', '#8a6a2c'],
  silver: ['#fbfbfc', '#c5c9cc', '#7b8186'],
  rose: ['#f7dcd2', '#d7a293', '#9b6558'],
} as const

export type MetalName = keyof typeof METALS
